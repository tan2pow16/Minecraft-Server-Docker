'use strict';

const child_process = require('child_process');
const fs = require('fs');
const https = require('https');
const _module_info = require('./package.json');

function default_conf()
{
  // 1.18.2 is the last version that does not come with the autocratic reign of M$.
  return {
    'mc-version': '1.18.2',
    'build-tag': 'mc-vanilla-server:build-0',
    'jdk-image': 'openjdk:17-slim',
    'container-name': 'mc-server',
    'rootless': 'gameserver:1024', // <name>:<uid>
    'instance-data-dir': `${__dirname}/minecraft-server`,
    'server-port': '25565',
    'memory': '1024M',
    'selinux': true
  };
}

function get_config(conf_path)
{
  if(!conf_path)
  {
    conf_path = `${__dirname}/conf.json`
  }

  if(fs.existsSync(conf_path) && fs.statSync(conf_path).isFile())
  {
    try
    {
      return JSON.parse(fs.readFileSync(conf_path));
    }
    catch(err)
    {
      console.error('Unable to load configuration! Abort!\n', err);
      return null;
    }
  }

  console.warn('No config file found! Default applied.');
  return default_conf();
}

function get_server_jar_url(version)
{
  return new Promise(function(resolve, reject) {
    https.get('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', function(resp) {
      if(resp.statusCode != 200)
      {
        reject(`Unable to acquire Minecraft version list (${resp.statusCode})! Abort!`);
        return;
      }

      let cache = [];
      resp.on('data', function(chunk) {
        cache.push(chunk);
      });

      resp.on('end', function() {
        let entries = JSON.parse(Buffer.concat(cache))['versions'];

        let hit = false;
        for(let i = 0 ; i < entries.length ; i++)
        {
          if(entries[i]['id'] === version)
          {
            hit = true;

            https.get(entries[i]['url'], function(resp2) {
              if(resp2.statusCode != 200)
              {
                reject(`Unable to acquire Minecraft version manifest (${resp2.statusCode})! Abort!`);
                return;
              }

              let cache2 = [];
              resp2.on('data', function(chunk) {
                cache2.push(chunk);
              });

              resp2.on('end', function() {
                resolve(JSON.parse(Buffer.concat(cache2))['downloads']['server']['url']);
              });
            }).on('error', function(err) {
              console.error(err);
              reject('Unable to acquire Minecraft version list! Abort!');
              return;
            });
          }
        }

        if(!hit)
        {
          reject('Invalid version!');
        }
      });
    }).on('error', function(err) {
      console.error(err);
      reject('Unable to acquire Minecraft version list! Abort!');
      return;
    });
  });
}

function help(conf)
{
  console.log(`Minecraft Rootless Docker Operator v${_module_info.version}`);
  console.log(' https://github.com/tan2pow16/minecraft-server-docker');
  console.log(' Copyright (c) 2022, tan2pow16. All rights reserved.');
  console.log('');
  console.log(`Usage: ${process.argv[0]} ${process.argv[1]} <command> [--conf </path/to/conf.json>]`);
  console.log('  install      - Install a server by building a docker image.');
  console.log('  create       - Create a server instance (docker container).');
  console.log('  start        - Start the server.');
  console.log('  console      - Access the server console.');
  console.log('  shell        - Access server container shell (as container root).');
  console.log('  stop         - (DEPRECATED! Use `console` if possible!) Force the server to stop.');
  console.log('  reset-perm   - Reset the server instance directory permissions for host access.');
  console.log('  retire       - Remove the server instance.');
  console.log('  uninstall    - Uninstall the server image from docker.');
  console.log('');
  console.log('You must check (and edit if needed) the configuration file `conf.json` before launching this tool!');
  return true;
}

function create_dockerfile(conf, server_jar_url)
{
  let rootless = conf['rootless'].split(':');
  if(rootless.length < 2)
  {
    console.error('Rootless entry must be in the format of "<name>:<uid>"! Abort!');
    return false;
  }

  try
  {
    console.log('Writing Dockerfile...');

    let setup_rootless_cmd;
    if(conf['jdk-image'].toLowerCase().indexOf('alpine') >= 0)
    {
      setup_rootless_cmd = `adduser -u ${rootless[1]} -s /usr/sbin/nologin -D ${rootless[0]}`;
    }
    else
    {
      setup_rootless_cmd = `useradd -u ${rootless[1]} -s /usr/sbin/nologin ${rootless[0]}`;
    }

    let fd = fs.openSync(`${__dirname}/Dockerfile`, 'w');
    fs.writeSync(fd, `FROM ${conf['jdk-image']}\n`);
    fs.writeSync(fd, `ADD ${server_jar_url} /data/bin/server-${conf['mc-version']}.jar\n`);
    fs.writeSync(fd, `RUN ${setup_rootless_cmd} && mkdir /data/instance && chown -R ${rootless[1]} /data/*\n`);
    fs.writeSync(fd, `WORKDIR /data/instance\n`);
    fs.writeSync(fd, `USER ${rootless[0]}\n`);
    fs.writeSync(fd, `CMD ["java", "-Xmx${conf['memory']}", "-Dlog4j2.formatMsgNoLookups=true", "-jar", "/data/bin/server-${conf['mc-version']}.jar", "--nogui"]\n`);
    fs.closeSync(fd);

    return true;
  }
  catch(err)
  {
    console.error('Unable to build docker image! Abort!\n', err);
    return false;
  }
}

function build_docker_image(conf)
{
  console.log('Building image...');
  let build_proc = child_process.spawnSync('docker', [
    'build',
    '--tag', conf['build-tag'],
    __dirname
  ], {
    cwd: __dirname,
    stdio: 'inherit'
  });

  if(build_proc.status === 0)
  {
    console.log('Docker image built successfully!');
    return true;
  }
  else
  {
    console.error('Docker image built failed!');
    return false;
  }
}

function install(conf)
{
  return new Promise(function(resolve, reject) {
    get_server_jar_url(conf['mc-version']).then(function(server_jar_url) {
      if(!create_dockerfile(conf, server_jar_url) || !build_docker_image(conf))
      {
        console.error('Installation failed!');
        resolve(false);
      }
      else
      {
        console.log('Installation completed!');
        resolve(true);
      }
    }, function(reject_reason) {
      console.error(reject_reason);
      resolve(false);
    });
  });
}

function create(conf)
{
  console.log('Creating container...');

  let setup_proc = child_process.spawnSync('docker', [
    'create',
    '-i',
    '--name', `${conf['container-name']}`,
    '-p', `${conf['server-port']}:${conf['server-port']}`,
    '-v', `${conf['instance-data-dir']}:/data/instance:z`,
    `localhost/${conf['build-tag']}`
  ], {
    stdio: 'inherit'
  });
  
  if(setup_proc.status === 0)
  {
    console.log('Container created successfully!');
    return true;
  }
  else
  {
    console.error('Container creation failed!');
    return false;
  }
}

function selinux_flag(conf)
{
  console.log('Setting up SELinux flags...');

  if(!reset_perm(conf))
  {
    return false;
  }

  let chcon_proc = child_process.spawnSync('chcon', [
    '-Rt', 'svirt_sandbox_file_t',
    conf['instance-data-dir']
  ], {
    stdio: 'inherit'
  });

  if(chcon_proc.status === 0)
  {
    console.log('SELinux flag change successfully!');
    return true;
  }
  else
  {
    console.error('SELinux flag change failed!');
    return false;
  }
}

function setup_perm(conf)
{
  let rootless = conf['rootless'].split(':');
  if(rootless.length < 2)
  {
    console.error('Rootless entry must be in the format of "<name>:<uid>"! Abort!');
    return false;
  }

  console.log('Setting up file permissions...');

  let chown_proc = child_process.spawnSync('docker', [
    'unshare',
    'chown', '-R',
    rootless[1],
    conf['instance-data-dir']
  ], {
    stdio: 'inherit'
  });

  if(chown_proc.status === 0)
  {
    console.log('File permission setup successfully!');
    return true;
  }
  else
  {
    console.error('File permission setup failed!');
    return false;
  }
}

function start_container(conf)
{
  let start_proc = child_process.spawnSync('docker', [
    'start',
    `${conf['container-name']}`
  ], {
    stdio: 'inherit'
  });

  if(start_proc.status === 0)
  {
    console.log('Server started successfully!');
    return true;
  }
  else
  {
    console.error('Unable to start the server!');
    return false;
  }
}

function start(conf)
{
  if((conf['selinux'] && !selinux_flag(conf)) || !setup_perm(conf) || !start_container(conf))
  {
    console.error('Server launch failed!');
    return false;
  }

  console.log('Server launch completed!');
  return true;
}

function attach(conf)
{
  let attach_proc = child_process.spawnSync('docker', [
    'attach',
    `${conf['container-name']}`
  ], {
    stdio: 'inherit'
  });

  if(attach_proc.status != 0)
  {
    console.error('Unable to attach the server console!');
    console.error('Did you start the server? Or perhaps the server crashed?');
    return false;
  }

  return true;
}

function delete_container(conf)
{
  let retire_proc = child_process.spawnSync('docker', [
    'container', 'rm',
    `${conf['container-name']}`
  ], {
    stdio: 'inherit'
  });

  if(retire_proc.status === 0)
  {
    if(!reset_perm(conf))
    {
      console.warn('You may have to reset file permissions manually to access server data!');
    }
    
    console.log('Server instance container removed successfully!');
    return true;
  }
  else
  {
    console.error('Unable to remove the server instance container!');
    return false;
  }
}

function stop(conf)
{
  let shutdown_proc = child_process.spawnSync('docker', [
    'stop',
    conf['container-name']
  ], {
    stdio: 'inherit'
  });

  if(shutdown_proc.status === 0)
  {
    if(!reset_perm(conf))
    {
      console.warn('You may have to reset file permissions manually to access server data!');
    }
    console.log('Server stopped successfully!');
    return true;
  }
  else
  {
    console.error('Unable to stop the server!');
    return false;
  }
}

function reset_perm(conf)
{
  let perm_proc = child_process.spawnSync('docker', [
    'unshare',
    'chown', '-R',
    '0:0',
    conf['instance-data-dir']
  ], {
    stdio: 'inherit'
  });

  if(perm_proc.status === 0)
  {
    console.log('File permission reset successfully!');
    return true;
  }
  else
  {
    console.error('File permission reset failed!');
    return false;
  }
}

function shell(conf)
{
  let shell_proc = child_process.spawnSync('docker', [
    'exec',
    '-itu', 'root',
    `${conf['container-name']}`,
    '/bin/sh'
  ], {
    stdio: 'inherit'
  });

  if(shell_proc.status != 0)
  {
    console.error('Unable to access container shell!');
    console.error('Did you start the server? Or perhaps the server crashed?');
    return false;
  }

  return true;
}

function uninstall(conf)
{
  let uninstall_proc = child_process.spawnSync('docker', [
    'image', 'rm',
    `${conf['build-tag']}`
  ], {
    stdio: 'inherit'
  });

  if(uninstall_proc.status === 0)
  {
    console.log('Server image removed successfully!');
    return true;
  }
  else
  {
    console.error('Unable to remove the server image!');
    console.error('You must stop the server and remove the container by using `retire` before uninstalling the image!');
    return false;
  }
}

function __main__(argv)
{
  let conf_path = null;
  if(argv.length > 1 && argv[1] == '--conf')
  {
    if(argv.length > 2)
    {
      conf_path = argv[2];
    }
    else
    {
      console.error('Invalid config file path!');
      return;
    }
  }

  let conf = get_config(conf_path);
  if(!conf)
  {
    return;
  }

  let commands = {};
  commands['help'] = help;
  commands['install'] = install;
  commands['create'] = create;
  commands['start'] = start;
  commands['console'] = attach;
  commands['stop'] = stop;
  commands['reset-perm'] = reset_perm;
  commands['retire'] = delete_container;
  commands['shell'] = shell;
  commands['uninstall'] = uninstall;

  let cmd = typeof(argv[0]) === 'string' ? commands[argv[0].toLowerCase()] : null;
  if(!cmd)
  {
    cmd = help;
  }

  process.exitCode = (cmd(conf) ? 0 : 1);
}

if(require.main === module)
{
  __main__(process.argv.slice(2));
}
