# Paraspace
Collaborative Programming, in Physical Space

## About

### What?
A Mixed-Reality environment that empowers visual artists to collaboratively
author responsive behaviors for virtual objects using actions 
inspired by concrete real-world interactions.

Alternatively, an exploratory interactive media MFA thesis project at USC. 

### Why?
Because programming doesn't have to involve writing code,
and because artists should be able to create simulations
using direct manipulation tools, in the same way that they 
can use direct manipulation tools to create images and animations.

### How?
Paraspace is based on the idea of "programming by demonstration" (see http://acypher.com/wwid/).
The basic idea is that you show the computer what to do by performing some actions, and then the computer repeats those actions if it encounters some context that you specify.

## Developing
Please be aware that everything in this repo currently represents prototype-quality code.

### Folder structure
`nodeServer` contains a node.js server written in [Typescript](https://www.typescriptlang.org/)
`SyncDemo` contains a [Unity](https://store.unity.com/) Project written in C#.

### Running the server:
Make sure you have `node` and `Typescript` installed.

Run `cd nodeServer; npm install`.

Then modify `const HOST = '192.168.1.255';`
on [line 65 of `nodeServer/src/client.ts`](https://github.com/jceipek/Thesis/blob/jc-kitchen/nodeServer/src/client.ts#L65)
to match your subnet (or change it to localhost: `const HOST = '127.0.0.1';`).
After installing Typescript, run `tsc --watch` to compile the changes and generate `nodeServer/js/client.js`
Now you can run `cd nodeServer/js/; node client.js` to launch the server (Yes, it is called 'client' instead of 'server', sorry). 

### Running the client (If you have an HTC VIVE):
Make sure [SteamVR](https://support.steampowered.com/kb_article.php?ref=2001-UXCM-4439) is installed and launched.
Open `SyncDemo/Assets/Demo 1` in Unity. Click play.

### Running the client (Without a VR headset):
Open `SyncDemo/Assets/Demo 1` in Unity. Uncheck `[CameraRig]` in the Hierarchy. Click play.