#!/bin/bash

PACKAGE=1
UPDATE=1
FORCE=0

for some in $*
do
    if [ $some == "--force"  ] || [ $some == "-f" ]
    then FORCE=1
    fi
    if
	[ $some == "--no-upgrade-packages" ] || [ $some == "-p" ]
	then PACKAGE=0
    fi

    if [ $some == "--no-update" ] || [ $some == "-u" ]
    then UPDATE=0
    fi
done

function verlte {
    [  "$1" = "`echo -e "$1\n$2" | sort -V | head -n1`" ]
}

function verlt {
    [ "$1" = "" ] && return 0 
    [ "$1" = "$2" ] && return 1 || verlte $1 $2
}

function update_atom {
    #Get URL to new version release of Atom
    local new_release=$(curl -I -s https://github.com/atom/atom/releases/latest | grep Location | cut -d " " -f 2 | tr -d '\r' | sed -e 's/tag/download/g')
    local remote_version=$(echo $new_release | cut -d "v" -f 2)
    local local_version=$(atom -v | head -n1 | awk '{print $3}')
    local output=$HOME/.atom-binary/

    #Check if NEW_RELEASES if newer than your version of atom
    if verlt "$local_version" "$remote_version" || [ $FORCE -eq 1 ]; then
        echo "Installing $remote_version of atom"
        mkdir -p $output
        curl -L $new_release/atom-amd64.tar.gz | tar zxf - --strip-components=1 -C $output
        # Installing Atom Binary in local path
        mkdir -p $HOME/.local/bin
        ln -sf $output/atom $HOME/.local/bin/
        # Installing Atom Icon
        mkdir -p $HOME/.local/share/pixmaps
        ln -sf $output/atom.png $HOME/.local/share/pixmaps
        # Installing Application .desktop
        mkdir -p $HOME/.local/share/applications/
        echo "[Desktop Entry]
Name=Atom
Comment=
GenericName=Text Editor
Exec=$HOME/.local/bin/atom %U
Icon=$HOME/.local/share/pixmaps/atom.png
Type=Application
StartupNotify=true
Categories=GNOME;GTK;Utility;TextEditor;Development;
MimeType=text/plain;" > $HOME/.local/share/applications/atom.desktop
        update-desktop-database
        # Install apm binary in local path
        mkdir -p $HOME/.local/bin
        ln -sf $output/resources/app/apm/bin/apm $HOME/.local/bin
    else
        echo "Atom ($local_version) is up to date!"
    fi
}

function package_update {
    # Update atom plugins
    apm update
}

if [ $PACKAGE -eq 1 ]; then
    package_update
fi

if [ $UPDATE -eq 1 ]; then
    update_atom
fi

exit 0
