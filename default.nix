{ pkgs ? import ./pkgs.nix {} }:

with pkgs;

{
  holo-auth-client = with python37Packages; buildPythonApplication {
    name = "holo-auth-client";
    src = gitignoreSource ./client;

    propagatedBuildInputs = [ requests ];
    meta.platforms = lib.platforms.linux;
  };
}
