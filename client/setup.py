from setuptools import setup

setup(
    name='holo-auth-client',
    packages=['holo_auth_client'],
    entry_points={
        'console_scripts': [
            'holo-auth-client=holo_auth_client:main'
        ],
    },
    install_requires=['requests']
)
