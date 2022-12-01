# Minecraft Server Rootless Docker Manager
Copyright (c) 2022, tan2pow16. All rights reserved.

---

## Intro

This is just a tool written in `Node.js` that makes setting up and running vanilla Minecraft servers inside rootless Docker/Podman images a bit more easily.  

Before running any commands, edit the configuration file (`conf.json`) to match your needs. The following fields are required.  
 * `mc-version`: The Minecraft version you choose.  
 * `build-tag`: The image name and tag. It's recommended to add your preferred Minecraft version in the tag for future identification.  
 * `jdk-image`: The base image that contains the required Java runtime.
 * `container-name`: Container to hold the server instance you'll be running.  
 * `rootless`: The rootless user context inside the Docker container. Must be in the format of `<name>:<uid>`.  
 * `instance-data-dir`: The path to the folder on the host machine that stores the server data, such as the server properties and world saves.  
   **Notice**: it's recommended to use an absolute path or it may lead to unwanted ambiguity!  
 * `server-port`: Open port of the server. Must be the same as that in `server.properties`.
 * `memory`: Maximum memory for the JVM.
 * `selinux`: Should be set to `true` if you're using an OS that utilizes SELinux. Without the proper flag, permissions of the data mounting point *will* fail.

You will need both `Node.js` and `Docker` (or `Podman`) to run this tool. All the operations, unless explicitly specified, do not require root access. You should **NOT** run these commands using `sudo` or `su`. Even better, you should create a host user without the `sudo` permission to run the tool.  

---

## Usage

### Setup a server image
 * `$ node vanilla-mc-server-docker install`  
   Create a `Dockerfile` and build an image tagged as `<build-tag>` based on the `<mc-version>`. The `<rootless>` and `<memory>` settings will be baked into the installation.  

### Create a server instance container
 * `$ node vanilla-mc-server-docker create`  
   Create a container named `<container-name>` based on the image `<build-tag>`. The `<server-port>` will be baked into the container. You should run this only after successfully installing an image.  

### Start the server
 * `$ node vanilla-mc-server-docker start`  
   Start the server instance container `<container-name>`. After the server has started, you may not be able to write to the server data folder while it's running.    

### Access the server console CLI
 * `$ node vanilla-mc-server-docker console`  
   Access the server console running under the instance container `<container-name>`.  

### Force a server to stop
 * `$ node vanilla-mc-server-docker stop`  
   Kill the server process running under the instance container `<container-name>`. This is **deprecated** and should only be used when the previously mentioned `console` command is not working.  

### Reset the server data folder permission
 * `$ node vanilla-mc-server-docker reset-perm`  
   Reset the file permission of `<instance-data-dir>` for future host access. Executing this command while the corresponding server instance is still running **WILL** crash the server! Use this command **ONLY AFTER** the server is stopped.  

### Access the shell of a running container instance
 * `$ node vanilla-mc-server-docker shell`  
   Access the container shell running under the instance container `<container-name>`. This will not work if the server is not running.  

### Remove a server container instance
 * `$ node vanilla-mc-server-docker retire`  
   Remove the instance container `<container-name>`. This will NOT delete the server data files.  

### Remove a server installation
 * `$ node vanilla-mc-server-docker uninstall`  
   Remove the server installation image `<build-tag>`.  

---

## Firewall setup

For most modern Linux setups, you may need to add certain ingress rules to allow inbound packets to pass through the server port. This is the *only* step that requires root permission. Here's an example on `CentOS stream 8` that opens the port `25565`:

```shell
$ sudo firewall-cmd --zone=public --permanent --add-port=25565/tcp
$ sudo firewall-cmd --zone=public --permanent --add-port=25565/udp
$ sudo firewall-cmd --reload
```

Please keep in mind that many cloud services require extra steps to configure such rules.
