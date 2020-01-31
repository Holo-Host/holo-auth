from setuptools import setup

setup(
    name='holo-auth-import',
    packages=['holo_auth_import'],
    entry_points={
        'console_scripts': [
            'holo-auth-import=holo_auth_import.main:main'
        ],
    },
    install_requires=['requests']
)
