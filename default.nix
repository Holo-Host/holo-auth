{ pkgs ? import ./pkgs.nix {} }:

with pkgs;


{
  hp-status-host-web = rec {
    name = "hp-status-host-web";
    src = gitignoreSource ./.;

    buildPhase = ''
      cp -r error/ target/error/
      cp -r success/ target/success/
    '';

    installPhase = ''
      mv target $out

      mkdir -p $out/nix-support
      echo "doc manual $out" >> $out/nix-support/hydra-build-products
    '';

    doCheck = false;
  };
}
