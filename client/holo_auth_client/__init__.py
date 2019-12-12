import json
import logging
import os
import requests
import subprocess
import sys

HOLO_AUTH_URL = "https://auth-server.holo.host/v1/challenge"


def state_path():
    return os.getenv('HPOS_STATE_PATH')


def admin_email():
    with open(state_path(), 'r') as f:
        config = json.load(f)
    return config['v1']['settings']['admin']['email']


def confirm_email(email, zerotier_address):
    return requests.post(HOLO_AUTH_URL, json={
        'email': email,
        'holochain_public_key': os.getenv('HOLOCHAIN_PUBLIC_KEY'),
        'zerotier_address': zerotier_address
    })


def zerotier_address():
    proc = subprocess.run(["zerotier-cli", "-j", "info"], capture_output=True)
    info = json.loads(proc.stdout)
    return info['address']


def main():
    logging.debug(confirm_email(admin_email(), zerotier_address()))


if __name__ == "__main__":
    main()
