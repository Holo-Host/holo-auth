{ pkgs ? import ./nixpkgs.nix {} }: with pkgs;

{
  hpstatus = stdenv.mkDerivation {
    name = "hpstatus";
    src = gitignoreSource ./res;

    buildPhase = ''
      cp -r $PWD $out
    '';

    installPhase = ''
      mkdir -p $out/nix-support
      echo "doc manual $out" >> $out/nix-support/hydra-build-products
    '';
  };
}
