{ pkgs ? import ./nixpkgs.nix {} }:

with pkgs;

let
  inherit (rust.packages.nightly) rustPlatform;
in

{
  holo-auth-client = buildRustPackage rustPlatform {
    name = "holo-auth-client";
    src = gitignoreSource ./.;
    cargoDir = "client";

    nativeBuildInputs = [ pkgconfig ];
    buildInputs = [ openssl ];

    meta.platforms = lib.platforms.linux;
  };

  holo-auth-import = with python37Packages; buildPythonApplication {
    name = "holo-auth-import";
    src = gitignoreSource ./import;

    propagatedBuildInputs = [ requests ];
  };
}
