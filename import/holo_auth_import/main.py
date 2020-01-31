from requests.adapters import HTTPAdapter
import json
import logging
import os
import requests
import time


CLOUDFLARE_ACCOUNT_ID = '18ff2b4e6205b938652998cfca0d8cff'
CLOUDFLARE_AGENT_ID_TO_IPV4_NAMESPACE_ID = 'e3de244cdc5241ce8b68096a3fab78ff'
CLOUDFLARE_WHITELIST_NAMESPACE_ID = '3130e2ca2d234214ba9db91622f7f197'
FRESHDESK_COMPANY_ID = 36000445120
ZEROTIER_NETWORK_ID = '93afae5963c547f1'


session = requests.Session()
session.mount('https://my.zerotier.com', HTTPAdapter(max_retries=50))
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.DEBUG)


def cloudflare_api_token():
    return os.environ['CLOUDFLARE_API_TOKEN']


def cloudflare_kv_request(method, endpoint, **kwargs):
    url = f'https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces' + endpoint
    return session.request(method, url, headers={'authorization': 'Bearer ' + cloudflare_api_token()}, **kwargs)


def cloudflare_kv_get(namespace_id, key):
    return cloudflare_kv_request('GET', f'/{namespace_id}/values/{key}').text


def cloudflare_kv_list(namespace_id, cursor):
    return cloudflare_kv_request('GET', f'/{namespace_id}/keys', params={'cursor': cursor}).json()


def cloudflare_kv_list_all(namespace_id):
    cursor = None
    keys = []

    while True:
        resp = cloudflare_kv_list(namespace_id, cursor)
        keys += [res['name'] for res in resp['result']]

        cursor = resp['result_info']['cursor']
        if not cursor:
            return keys


def cloudflare_kv_get_all(namespace_id):
    keys = cloudflare_kv_list_all(namespace_id)
    return {key: cloudflare_kv_get(namespace_id, key) for key in keys}


def cloudflare_kv_set_all(namespace_id, kv):
    cloudflare_kv_request('PUT', f'/{namespace_id}/bulk',
        json=[{'key': k, 'value': v, 'base64': False} for k, v in kv.items()])


def freshdesk_api_key():
    return os.environ['FRESHDESK_API_KEY']


def freshdesk_contacts(page):
    return session.get(
        'https://holo.freshdesk.com/api/v2/contacts',
        auth=(freshdesk_api_key(), '_'),
        params={'company_id': FRESHDESK_COMPANY_ID, 'page': page}).json()


def freshdesk_all_contacts():
    all_contacts = []
    current_page = 1
    while True:
        contacts = freshdesk_contacts(current_page)
        if contacts == []:
            return all_contacts
        all_contacts += contacts
        current_page += 1
        # https://developers.freshdesk.com/api/#ratelimit
        time.sleep(1)


def zerotier_central_api_token():
    return os.environ['ZEROTIER_CENTRAL_API_TOKEN']


def zerotier_network_request(method, endpoint, **kwargs):
    url = f'https://my.zerotier.com/api/network/{ZEROTIER_NETWORK_ID}' + endpoint
    return session.request(method, url, headers={'authorization': 'Bearer ' + zerotier_central_api_token()}, **kwargs)


def zerotier_network_update_member(address, data):
    zerotier_network_request('POST', f'/member/{address}', json=data)


def zerotier_network_members():
    return zerotier_network_request('GET', f'/member').json()


def main():
    zerotier_members = zerotier_network_members()
    ipv4_to_zerotier_address = {member['config']['ipAssignments'][0]: member['nodeId']
        for member in zerotier_members if member['config']['ipAssignments']}

    agent_id_to_ipv4 = cloudflare_kv_get_all(CLOUDFLARE_AGENT_ID_TO_IPV4_NAMESPACE_ID)
    agent_id_to_zerotier_address = \
        {agent_id: ipv4_to_zerotier_address[ipv4] for agent_id, ipv4 in agent_id_to_ipv4.items() if ipv4 != 'undefined'}

    freshdesk_contacts = freshdesk_all_contacts()
    cloudflare_kv_set_all(CLOUDFLARE_WHITELIST_NAMESPACE_ID,
        {contact['email']: '{}' for contact in freshdesk_contacts})

    for contact in freshdesk_contacts:
        if contact['description']:
            try:
                agent_id = json.loads(contact['description'])['pubkey']
                if agent_id in agent_id_to_zerotier_address:
                    zerotier_network_update_member(agent_id_to_zerotier_address[agent_id], {
                        'description': contact['email'],
                        'name': agent_id
                    })
            except ValueError:
                logger.warning("Couldn't import ZeroTier metadata: " + contact['email'])


if __name__ == '__main__':
    main()
