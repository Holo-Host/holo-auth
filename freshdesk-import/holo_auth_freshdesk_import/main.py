import os
import requests
import time

CLOUDFLARE_ACCOUNT_ID = '18ff2b4e6205b938652998cfca0d8cff'
CLOUDFLARE_WHITELIST_ID = '3130e2ca2d234214ba9db91622f7f197'
FRESHDESK_COMPANY_ID = 36000445120


def freshdesk_api_key():
    return os.environ['FRESHDESK_API_KEY']


def freshdesk_contacts(page):
    return requests.get(
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


def cloudflare_api_token():
    return os.environ['CLOUDFLARE_API_TOKEN']


def cloudflare_whitelist_import(emails):
    requests.put('https://api.cloudflare.com/client/v4/accounts/{}/storage/kv/namespaces/{}/bulk'.format(CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_WHITELIST_ID),
        headers={'authorization': 'Bearer ' + cloudflare_api_token()},
        json=list(map(lambda email: {'key': email, 'value': '{}', 'base64': False}, emails)))


def main():
    emails = list(map(lambda contact: contact['email'], freshdesk_all_contacts()))
    cloudflare_whitelist_import(emails)


if __name__ == '__main__':
    main()
