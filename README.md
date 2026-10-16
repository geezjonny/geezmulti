# Multi VTT

A buildless Three.js tabletop app for GitHub Pages. Import Universal VTT / DD2VTT maps in `dd2vtt.html`; use `viewer.html` for a token’s first-person view.

## Try it before Firebase

Double-click `start-server.cmd`, then open **http://localhost:8080**. Alternatively, run `npm start` from this folder (Python required).

1. Open the GM table and create a session.
2. Load the demo dungeon or import a `.dd2vtt` file.
3. Add a token. Select it and click the map floor to place or move it.
4. Copy the player invite and open it in another tab in the **same browser and profile**.
5. Enter a player name and join. Return to the GM tab and assign that player using the token’s dropdown.
6. In the viewer, enter character view. Moving the token in the GM tab moves the viewer camera.

Without Firebase configuration, IndexedDB stores sessions and BroadcastChannel syncs tabs. This demo requires the same origin, browser and profile; it does not connect separate devices. CDN libraries still require internet access. Local demo data is separate from Firebase data and is not migrated automatically.

## Connect your new Firebase project

1. In the Firebase console, create a project and register a **Web app**.
2. Enable **Authentication → Sign-in method → Anonymous**. No email/password accounts are required. Each browser gets a persistent Firebase UID; the GM assigns player identities to tokens.
3. Create a **Realtime Database**. This app uses Realtime Database, not Firestore. Copy its database URL.
4. Paste the Web app configuration into `firebase-config.js`, including `databaseURL`. The config is intended to be public browser configuration; do not add Admin SDK keys or service-account credentials.
5. In **Realtime Database → Rules**, replace the rules with `database.rules.json` and publish them. Do not leave the database in test mode.
6. In Authentication settings, add your GitHub Pages hostname to Authorized domains. Add `localhost` for local testing if it is absent.
7. Reload the app. Its header should show **FIREBASE · connected**. Create a new session and share its viewer invite with another device.

The config file has empty values until you create your Firebase project. Live Firebase operation cannot be verified before those values and rules are installed.

## Publish on GitHub Pages

1. Create a GitHub repository and upload the **contents** of this folder to its root. Include `.nojekyll`.
2. Open **Settings → Pages**. Choose **Deploy from a branch**, then your branch and **/ (root)**.
3. Open `https://YOUR-USER.github.io/YOUR-REPO/`. Both HTML pages and all assets use relative URLs, so repository subpaths work.
4. Use the published HTTPS URL on iPhone. A phone cannot reach your desktop’s `localhost` address.

## GM workflow

- Create a session, or reopen one from the same browser identity. The last GM session opens automatically.
- Import DD2VTT. Its embedded PNG, JPEG or WebP becomes the floor texture. Wall polylines and object polylines become solid wall segments. Portal bounds become doors.
- Coordinates subtract `resolution.map_origin` so cropped maps align. One map grid square equals one scene unit. Wall height is configurable from 0.2 to 10 grid units; default is 2.5.
- Imported doors retain their initial open/closed state. Toggle them from the Doors panel. Opening a door removes it visually from the opening.
- Add tokens; change their names and facing angles. Select a token, then click the floor to move it. A click on a token selects it. Drag to orbit, right-drag to pan, scroll to zoom.
- Have players join the session before assigning them in token dropdowns. A player may have multiple assigned tokens and choose among them in the viewer.
- Replacing a map removes existing tokens and door overrides after confirmation.

## iPhone viewer

Join using the GM’s invite, supply a name, and wait for assignment. Enter character view. The camera sits 1.1 grid units above the assigned token, faces its GM-set heading, and follows GM movement. Its own token model is hidden.

Drag to look on desktop or touch screens. On iPhone, tap **Enable motion** and grant permission. Hold the phone upright and tap **Recenter** to make its current horizontal direction the character’s forward direction. Screen rotation is compensated. **Disable motion** returns to drag look. Motion controls only the local view; they do not rotate or move the shared token. Sensor support and permissions vary by browser. If fullscreen is unavailable on iPhone, use Safari’s Add to Home Screen.

## Data and access

```
sessions/{sessionCode}/
  meta/         owner UID, creation timestamp
  scene/        normalized map (including base64 floor), height, revision
  tokens/{id}/  name, position, facing, color, assigned player UID
  players/{uid}/ name, join timestamp
  doors/{id}/   boolean closed override
```

Everything, including the embedded image, is saved in Firebase Realtime Database. No Cloud Storage bucket is needed for this version. The normalized scene has a 12 MiB import limit, below the SDK’s 16 MiB single-write limit. Source files are capped at 14 MiB. For bigger maps, export a lower-resolution image; a later version could move assets to Cloud Storage. Original lighting metadata and unrelated source fields are not preserved; this version saves the rendered floor and geometry.

Scene, token, player and door listeners are separate, so moving a token does not download the map image again. Map replacement uses one atomic multi-path update. Realtime Database handles live updates and temporary reconnection; edits should be made while connected and committed before closing the tab. Persistent offline Firebase editing is not implemented.

Rules let only the session owner edit the map, doors, tokens and assignments. A player can write only their own player registration. Authenticated visitors who know a session code can read its scene and player list. This is invite-code access, with no fog of war or secret-map protection; token assignment controls which character the viewer follows, not access to downloaded geometry. Parent session listing is denied. Use the generated random session codes.

Anonymous identities belong to a browser profile. Clearing site data, using private browsing or switching browsers creates a different identity. Keep the GM’s original browser/profile; account linking and GM ownership recovery are not implemented. Separate devices get separate UIDs, even for the same person, and need their own token assignment.

Walls and doors are visual geometry. There is no collision checking, player movement, combat engine, fog of war, or DD2VTT light-source recreation in this version. The GM can move tokens through walls. Ambient scene lighting keeps the imported floor visible.

## Checks

Run `npm test` (Node 20+). Tests cover DD2VTT coordinate normalization, door bounds/state, image formats and invalid inputs. Optionally set `DD2VTT_TEST_FILE` to test a real export.

On Windows with Microsoft Edge installed at its standard location, run `node scripts/browser-smoke.mjs` for an isolated headless local-mode check of the GM/player flow. This check intercepts the config response in its browser only; it never changes your Firebase configuration or writes to live Firebase. It uses ports 8094 and 9229 and saves ignored test profile/screenshots under `.qa-profile` and `.qa-output`. Real iPhone sensor behavior still requires a physical device.

Manual acceptance check after Firebase setup: join from a second device, assign its UID, move its token, toggle a door, adjust wall height, reload both pages, and verify that scene and token state persist. Verify that an unassigned player cannot choose other players’ tokens, then test Safari motion permission, recentering and portrait/landscape rotation. Security rules should also be tested in the Firebase rules simulator: GM writes succeed; player token/map writes and parent session listing fail; players can register only their own UID.

References: [Firebase browser setup](https://firebase.google.com/docs/web/alt-setup), [Realtime Database writes/listeners](https://firebase.google.com/docs/database/web/read-and-write), [Database security rules](https://firebase.google.com/docs/database/security), [Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html), [iPhone motion permission API](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static).
