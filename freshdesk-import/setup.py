from setuptools import setup

setup(
    name='holo-auth-freshdesk-import',
    packages=['holo_auth_freshdesk_import'],
    entry_points={
        'console_scripts': [
            'holo-auth-freshdesk-import=holo_auth_freshdesk_import.main:main'
        ],
    },
    install_requires=['requests']
)
