{ pkgs ? import ./pkgs.nix {} }:

with pkgs;

mkShell {
  buildInputs = [ nodejs python wrangler ];
}
