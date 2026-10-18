/**
 * The 3D karaoke bar: room, stage, lights, characters, effects and the camera director.
 * Characters are created on demand per player id, so the scene follows whoever is in the room.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const easeOut = (p) => 1 - Math.pow(1 - p, 3);

export const STAGE_TOP = 0.6;
const SPOT = new THREE.Vector3(0, STAGE_TOP, -2.75);

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  // Neutral keeps the characters' colors true; ACES washed bright pinks and yellows out to pastel
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#140c10');
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Only the lamps (colors pushed above 1) glow; characters and props stay crisp
  // Tight bloom: lamps glow at their edges instead of smearing light across the frame
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.18, 2.3);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Four soft bands, topping out below pure white so lit faces never blow out
  const GRADIENT = (() => {
    const d = new Uint8Array([110, 110, 110, 255, 170, 170, 170, 255, 215, 215, 215, 255, 238, 238, 238, 255]);
    const t = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  })();
  const toon = (color, opts = {}) => new THREE.MeshToonMaterial({ color, gradientMap: GRADIENT, ...opts });
  const OUTLINE = new THREE.MeshBasicMaterial({ color: '#1a0f14', side: THREE.BackSide });
  const outline = (m, s = 1.04) => { const o = new THREE.Mesh(m.geometry, OUTLINE); o.scale.setScalar(s); m.add(o); return m; };
  function M(geo, mat, x = 0, y = 0, z = 0, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    return m;
  }
  const glowMats = [];
  let api_kitHead = null, api_keyTop = null;
  function glow(color, power = 2.6) {
    const m = new THREE.MeshBasicMaterial({ color });
    m.userData.base = new THREE.Color(color).multiplyScalar(power);
    m.color.copy(m.userData.base);
    glowMats.push(m);
    return m;
  }

  /* ---------- Canvas textures ---------- */
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    return t;
  }
  const woodTex = (dark) => canvasTex(1024, 1024, (c, w, h) => {
    const tones = dark ? ['#4a2c1e', '#43281b', '#503021', '#3e2519'] : ['#8f5a34', '#83522f', '#986139', '#8a5631', '#7c4d2c'];
    const ph = 128;
    for (let y = 0; y < h; y += ph) {
      let x = -Math.random() * 400;
      while (x < w) {
        const len = rand(300, 620);
        c.fillStyle = pick(tones);
        c.fillRect(x, y, len, ph);
        for (let g = 0; g < 26; g++) {
          c.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,20,10' : '255,220,170'},${rand(0.03, 0.08)})`;
          c.lineWidth = rand(1, 3);
          const gy = y + rand(4, ph - 4);
          c.beginPath(); c.moveTo(x, gy);
          c.bezierCurveTo(x + len * 0.3, gy + rand(-6, 6), x + len * 0.7, gy + rand(-6, 6), x + len, gy + rand(-3, 3));
          c.stroke();
        }
        c.fillStyle = 'rgba(30,14,8,0.55)';
        c.fillRect(x, y, 3, ph);
        x += len;
      }
      c.fillStyle = 'rgba(30,14,8,0.7)';
      c.fillRect(0, y, w, 4);
    }
  }, dark ? [2, 1] : [4, 4]);
  const brickTex = canvasTex(1024, 512, (c, w, h) => {
    c.fillStyle = '#3a2220';
    c.fillRect(0, 0, w, h);
    const bw = 128, bh = 52, gap = 7;
    for (let row = 0, y = 0; y < h; row++, y += bh) {
      for (let x = row % 2 ? -bw / 2 : 0; x < w; x += bw) {
        c.fillStyle = pick(['#743a2b', '#683226', '#7c3d2d', '#622e23', '#723f30']);
        c.fillRect(x + gap / 2, y + gap / 2, bw - gap, bh - gap);
        c.fillStyle = 'rgba(255,200,160,0.05)';
        c.fillRect(x + gap / 2, y + gap / 2, bw - gap, 5);
        c.fillStyle = 'rgba(0,0,0,0.18)';
        c.fillRect(x + gap / 2, y + bh - gap / 2 - 6, bw - gap, 6);
      }
    }
  }, [3, 2.4]);
  function neonTex(text, color, font, w = 1024, h = 300) {
    return canvasTex(w, h, (c) => {
      c.font = font;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (const [blur, alpha] of [[60, 0.9], [26, 1], [8, 1], [0, 1]]) {
        c.shadowColor = color; c.shadowBlur = blur; c.globalAlpha = alpha;
        c.lineWidth = blur ? 14 : 5;
        c.strokeStyle = color;
        if (blur) c.strokeText(text, w / 2, h / 2 + 8);
        else { c.fillStyle = '#fff8f0'; c.fillText(text, w / 2, h / 2 + 8); }
      }
    });
  }

  /* =====================================================================
     The bar
     ===================================================================== */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshStandardMaterial({ map: woodTex(false), roughness: 0.78 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 2.5;
  floor.receiveShadow = true;
  scene.add(floor);
  const brick = new THREE.Mesh(new THREE.PlaneGeometry(18, 8), new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.92 }));
  brick.position.set(0, 4, -5);
  brick.receiveShadow = true;
  scene.add(brick);
  const paint = new THREE.MeshStandardMaterial({ color: '#2d1d27', roughness: 0.95 });
  const wainscot = new THREE.MeshStandardMaterial({ map: woodTex(true), roughness: 0.8 });
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), paint);
    wall.position.set(s * 8, 4, 3);
    wall.rotation.y = -s * Math.PI / 2;
    scene.add(wall);
    const wp = new THREE.Mesh(new THREE.PlaneGeometry(16, 1.3), wainscot);
    wp.position.set(s * 7.98, 0.65, 3);
    wp.rotation.y = -s * Math.PI / 2;
    scene.add(wp);
  }
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(18, 8), paint);
  backWall.position.set(0, 4, 11);
  backWall.rotation.y = Math.PI;
  scene.add(backWall);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshStandardMaterial({ color: '#160e13', roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 6.4, 3);
  scene.add(ceiling);

  const stageWood = new THREE.MeshStandardMaterial({ map: woodTex(true), roughness: 0.66 });
  const stageFace = new THREE.MeshStandardMaterial({ color: '#241319', roughness: 0.8 });
  const stage = new THREE.Mesh(new THREE.BoxGeometry(7.6, STAGE_TOP, 3.8), [stageFace, stageFace, stageWood, stageFace, stageFace, stageFace]);
  stage.position.set(0, STAGE_TOP / 2, -3.1);
  stage.receiveShadow = true;
  stage.castShadow = true;
  scene.add(stage);
  scene.add(M(new THREE.BoxGeometry(7.7, 0.06, 0.08), new THREE.MeshStandardMaterial({ color: '#b8944e', roughness: 0.45, metalness: 0.6 }), 0, STAGE_TOP - 0.02, -1.2));
  const BULBS = 19;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial(), BULBS);
  {
    const d = new THREE.Object3D();
    for (let i = 0; i < BULBS; i++) {
      d.position.set(-3.6 + (7.2 * i) / (BULBS - 1), STAGE_TOP * 0.5, -1.18);
      d.updateMatrix();
      bulbs.setMatrixAt(i, d.matrix);
      bulbs.setColorAt(i, new THREE.Color(1.2, 0.95, 0.65));
    }
  }
  scene.add(bulbs);

  const velvet = toon('#8e1828');
  const velvetDark = toon('#64101d');
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) scene.add(M(new THREE.CylinderGeometry(0.17, 0.2, 5.4, 12), i % 2 ? velvet : velvetDark, s * (3.25 + i * 0.22), STAGE_TOP + 2.7, -4.75 + (i % 2) * 0.08));
  for (let i = 0; i < 22; i++) {
    const sw = M(new THREE.SphereGeometry(0.28, 14, 10), i % 2 ? velvet : velvetDark, -4.2 + i * 0.4, 5.75, -4.7);
    sw.scale.set(1, 1.4, 0.5);
    scene.add(sw);
  }
  scene.add(M(new THREE.BoxGeometry(9, 0.35, 0.3), toon('#b8944e'), 0, 6.15, -4.7));

  function neonPlane(w, h, power) {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    mat.userData.base = new THREE.Color(power, power, power);
    glowMats.push(mat);
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  }
  const neonSign = neonPlane(5.0, 1.46, 1.5);
  neonSign.position.set(0, 4.25, -4.96);
  scene.add(neonSign);
  const sideSign = neonPlane(2.6, 0.76, 1.25);
  sideSign.position.set(-7.95, 3.4, 1.4);
  sideSign.rotation.y = Math.PI / 2;
  scene.add(sideSign);

  const cab = toon('#1f1a24');
  const cone = toon('#3a3442');
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.add(outline(M(new THREE.BoxGeometry(0.95, 1.55, 0.7), cab, 0, 0.775, 0), 1.02));
    for (const [y, r] of [[1.12, 0.22], [0.5, 0.32]]) {
      const ring = M(new THREE.CylinderGeometry(r, r, 0.05, 28), cone, 0, y, 0.36);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      const dust = M(new THREE.SphereGeometry(r * 0.32, 14, 10), toon('#5a5266'), 0, y, 0.38);
      dust.scale.z = 0.5;
      g.add(dust);
    }
    g.position.set(s * 3.05, STAGE_TOP, -3.9);
    g.rotation.y = -s * 0.25;
    scene.add(g);
  }

  const micStand = new THREE.Group();
  {
    const metal = new THREE.MeshStandardMaterial({ color: '#a9a9b2', roughness: 0.4, metalness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: '#25222a', roughness: 0.5, metalness: 0.4 });
    micStand.add(M(new THREE.CylinderGeometry(0.2, 0.24, 0.035, 36), dark, 0, 0.018, 0));
    micStand.add(M(new THREE.CylinderGeometry(0.016, 0.016, 0.72, 12), metal, 0, 0.37, 0));
    const head = new THREE.Group();
    head.position.set(0, 0.72, 0);
    head.rotation.x = -0.75;
    head.add(M(new THREE.CylinderGeometry(0.03, 0.02, 0.16, 14), dark, 0, 0.06, 0));
    head.add(M(new THREE.SphereGeometry(0.058, 20, 14), metal, 0, 0.17, 0));
    micStand.add(head);
  }
  micStand.position.set(0, STAGE_TOP, -2.2);
  scene.add(micStand);

  const stringBulbs = [];
  const wireMat = new THREE.LineBasicMaterial({ color: '#1a1014' });
  for (const z of [-0.6, 2.2, 5.0]) {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push(new THREE.Vector3(-7.8 + u * 15.6, 5.6 - Math.sin(u * Math.PI) * 0.7, z)); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    for (let i = 2; i < 40; i += 2.5) stringBulbs.push(pts[Math.floor(i)].clone().add(new THREE.Vector3(0, -0.07, 0)));
  }
  const strings = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshBasicMaterial(), stringBulbs.length);
  {
    const d = new THREE.Object3D();
    stringBulbs.forEach((p, i) => { d.position.copy(p); d.updateMatrix(); strings.setMatrixAt(i, d.matrix); strings.setColorAt(i, new THREE.Color(2.4, 1.75, 1.05)); });
  }
  scene.add(strings);
  const disco = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 2), new THREE.MeshStandardMaterial({ color: '#d8d8e0', roughness: 0.3, metalness: 0.45, flatShading: true }));
  disco.position.set(0, 5.4, 0.6);
  scene.add(disco);
  // Disco Fever: five moving-head lights on the truss sweep the room in party colors,
  // each with a soft visible beam, while the mirror ball spins up and the room dims around them
  const DOWN = new THREE.Vector3(0, -1, 0);
  const discoRig = new THREE.Group();
  discoRig.visible = false;
  scene.add(discoRig);
  const discoHeads = ['#ff3d8b', '#33d6ff', '#ffe23d', '#5dff8f', '#ff8a3d'].map((c, i) => {
    const light = new THREE.SpotLight(c, 0, 18, 0.3, 0.45, 1.1);
    light.position.set(-3.4 + i * 1.7, 5.85, -1.4);
    scene.add(light, light.target);
    const geo = new THREE.ConeGeometry(0.75, 7, 28, 1, true);
    geo.translate(0, -3.5, 0);
    const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.copy(light.position);
    discoRig.add(beam);
    return { light, beam, ph: i * 1.27 };
  });
  let discoOn = false, discoK = 0;
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 5.76, 0.6), new THREE.Vector3(0, 6.4, 0.6)]), wireMat));

  function table(x, z) {
    const g = new THREE.Group();
    g.add(outline(M(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 28), toon('#5b3524'), 0, 0.95, 0), 1.03));
    g.add(M(new THREE.CylinderGeometry(0.05, 0.05, 0.92, 10), toon('#2b1f25'), 0, 0.47, 0));
    g.add(M(new THREE.CylinderGeometry(0.28, 0.32, 0.04, 20), toon('#2b1f25'), 0, 0.02, 0));
    for (const [dx, dz, c] of [[-0.18, 0.1, '#e8a23f'], [0.2, -0.08, '#e85f7c']]) g.add(M(new THREE.CylinderGeometry(0.06, 0.05, 0.18, 14), toon(c), dx, 1.07, dz));
    g.position.set(x, 0, z);
    scene.add(g);
  }
  table(-5.2, 2.3); table(5.2, 2.6); table(-4.4, 5.6);
  function plant(x, z, s = 1) {
    const g = new THREE.Group();
    g.add(outline(M(new THREE.CylinderGeometry(0.32, 0.24, 0.6, 18), toon('#b8583a'), 0, 0.3, 0), 1.04));
    for (let i = 0; i < 7; i++) {
      const leaf = M(new THREE.SphereGeometry(0.26, 12, 8), toon(i % 2 ? '#2a8048' : '#379756'), Math.cos(i) * 0.18, 0.85 + (i % 3) * 0.22, Math.sin(i) * 0.18);
      leaf.scale.set(0.55, 1.4, 0.35);
      leaf.rotation.set(Math.sin(i * 2) * 0.6, i, Math.cos(i * 3) * 0.5);
      g.add(leaf);
    }
    g.scale.setScalar(s);
    g.position.set(x, 0, z);
    scene.add(g);
  }
  plant(-6.9, -3.8, 1.3); plant(6.9, -3.8, 1.3); plant(7.1, 6, 1.1);
  {
    const couch = new THREE.Group();
    const fab = toon('#2b6468');
    couch.add(outline(M(new THREE.BoxGeometry(2.6, 0.45, 1.0), fab, 0, 0.42, 0), 1.02));
    couch.add(outline(M(new THREE.BoxGeometry(2.6, 0.75, 0.3), fab, 0, 0.85, 0.42), 1.02));
    for (const s of [-1, 1]) couch.add(outline(M(new THREE.BoxGeometry(0.3, 0.65, 1.0), fab, s * 1.3, 0.6, 0), 1.03));
    couch.position.set(6.4, 0, 3.8);
    couch.rotation.y = -Math.PI / 2;
    scene.add(couch);
  }
  {
    const bar = new THREE.Group();
    bar.add(outline(M(new THREE.BoxGeometry(7, 1.1, 0.9), toon('#3a2119'), 0, 0.55, 0), 1.01));
    bar.add(M(new THREE.BoxGeometry(7.2, 0.08, 1.05), toon('#6b3d27'), 0, 1.12, 0));
    for (const y of [2.0, 2.7]) {
      bar.add(M(new THREE.BoxGeometry(6, 0.06, 0.35), toon('#3a2119'), 0, y, 1.65));
      for (let i = 0; i < 16; i++) {
        const h = rand(0.3, 0.46);
        bar.add(M(new THREE.CylinderGeometry(0.06, 0.07, h, 10), toon(pick(['#2a8f50', '#94501d', '#c4ad6c', '#5e1b26', '#284f8f'])), -2.7 + i * 0.36, y + h / 2 + 0.03, 1.65, false));
      }
    }
    const strip = new THREE.Mesh(new THREE.BoxGeometry(6, 0.04, 0.04), glow('#ffb36b', 2.2));
    strip.position.set(0, 2.05, 1.8);
    bar.add(strip);
    bar.position.set(0, 0, 8.9);
    scene.add(bar);
  }

  /* ---------- Set dressing: string lights, bunting, lanterns, posters, instruments ---------- */
  const GARLAND = ['#fff1c9', '#ff5a4a', '#ffc22e', '#3ddc84', '#4aa3ff', '#ff7ab8'];
  const garlandPts = [];
  /** A drooping string of lights from a to b, `dips` swags deep `sag`. */
  function garland(a, b, dips, sag, every = 0.26) {
    const pts = [];
    const n = 60 * dips;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const local = (u * dips) % 1;
      pts.push(new THREE.Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - Math.sin(local * Math.PI) * sag, a.z + (b.z - a.z) * u));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += pts[i].distanceTo(pts[i - 1]);
      if (acc >= every) { acc = 0; garlandPts.push(pts[i].clone().add(new THREE.Vector3(0, -0.05, 0.01))); }
    }
  }
  garland(new THREE.Vector3(-3.05, 5.35, -4.93), new THREE.Vector3(3.05, 5.35, -4.93), 3, 0.42);
  garland(new THREE.Vector3(-3.05, 2.6, -4.6), new THREE.Vector3(-3.05, 5.4, -4.6), 1, 0.0, 0.3);
  garland(new THREE.Vector3(3.05, 2.6, -4.6), new THREE.Vector3(3.05, 5.4, -4.6), 1, 0.0, 0.3);
  garland(new THREE.Vector3(-7.6, 5.3, 6.5), new THREE.Vector3(-4.6, 5.3, -1.0), 2, 0.5);
  garland(new THREE.Vector3(7.6, 5.3, 6.5), new THREE.Vector3(4.6, 5.3, -1.0), 2, 0.5);
  const fairy = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial(), garlandPts.length);
  {
    const d = new THREE.Object3D();
    garlandPts.forEach((p, i) => { d.position.copy(p); d.updateMatrix(); fairy.setMatrixAt(i, d.matrix); fairy.setColorAt(i, new THREE.Color(GARLAND[i % GARLAND.length]).multiplyScalar(1.7)); });
  }
  scene.add(fairy);
  const fairyBase = garlandPts.map((_, i) => new THREE.Color(GARLAND[i % GARLAND.length]).multiplyScalar(1.7));

  // Pennant bunting across the room
  const PENNANTS = ['#ff4d3d', '#ffc22e', '#25d39b', '#3d8bff', '#ff7aa2', '#a98bff'];
  const flagGeo = (() => { const s = new THREE.Shape(); s.moveTo(-0.16, 0); s.lineTo(0.16, 0); s.lineTo(0, -0.34); s.closePath(); return new THREE.ShapeGeometry(s); })();
  const flagMats = PENNANTS.map((c) => toon(c, { side: THREE.DoubleSide }));
  for (const [z, y, sag] of [[-0.9, 5.65, 0.55], [2.6, 5.75, 0.6]]) {
    const pts = [];
    for (let i = 0; i <= 80; i++) { const u = i / 80; pts.push(new THREE.Vector3(-7.8 + u * 15.6, y - Math.sin(u * Math.PI) * sag, z)); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    for (let i = 3; i < 78; i += 3) {
      const f = new THREE.Mesh(flagGeo, flagMats[(i / 3) % PENNANTS.length | 0]);
      f.position.copy(pts[i]);
      f.rotation.x = rand(-0.12, 0.12);
      scene.add(f);
    }
  }

  // Paper lanterns over the crowd
  const lanterns = [];
  for (const [x, y, z, c] of [[-4.6, 4.5, 1.2, '#ff8a3d'], [-2.2, 4.9, 4.2, '#ff5f8a'], [2.6, 4.7, 5.0, '#ffc22e'], [3.0, 4.8, 3.6, '#ff8a3d'], [5.0, 4.4, 0.9, '#ff5f8a'], [-5.6, 4.8, 5.8, '#ffc22e']]) {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), glow(c, 1.15));
    shell.scale.y = 0.85;
    g.add(shell);
    for (const s of [-1, 1]) g.add(M(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16), toon('#2b1f25'), 0, s * 0.3, 0, false));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0, 6.4 - y, 0)]), wireMat));
    g.position.set(x, y, z);
    g.userData.ph = rand(0, 6);
    scene.add(g);
    lanterns.push(g);
  }

  // Posters and records on the brick wall
  const posterMats = [];
  function poster(x, y, w, h, rot) {
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, -4.97);
    m.rotation.z = rot;
    scene.add(m);
    posterMats.push({ mat, w, h });
    return mat;
  }
  poster(-5.7, 3.4, 1.5, 2.1, 0.04);
  poster(6.9, 3.0, 1.3, 1.8, -0.05);
  poster(-7.0, 2.6, 1.0, 1.35, -0.06);
  const vinylMat = toon('#151218');
  for (const [x, y, c] of [[-5.0, 5.1, '#ff4d3d'], [-5.75, 5.55, '#ffc22e'], [-4.55, 5.75, '#3d8bff']]) {
    const rec = M(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 40), vinylMat, x, y, -4.96, false);
    rec.rotation.x = Math.PI / 2;
    scene.add(rec);
    const label = M(new THREE.CylinderGeometry(0.12, 0.12, 0.025, 24), toon(c), x, y, -4.955, false);
    label.rotation.x = Math.PI / 2;
    scene.add(label);
  }

  // Band gear behind the singer: a drum kit and a keyboard
  {
    const kit = new THREE.Group();
    const shellMat = toon('#c8331f');
    const chrome = new THREE.MeshStandardMaterial({ color: '#c9c9d2', roughness: 0.35, metalness: 0.75 });
    const brass = new THREE.MeshStandardMaterial({ color: '#d4a640', roughness: 0.35, metalness: 0.7 });
    const kick = outline(M(new THREE.CylinderGeometry(0.4, 0.4, 0.38, 32), shellMat, 0, 0.42, 0), 1.03);
    kick.rotation.x = Math.PI / 2;
    kit.add(kick);
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.36, 32), new THREE.MeshStandardMaterial({ color: '#f3ece4', roughness: 0.8 }));
    head.position.set(0, 0.42, 0.195);
    kit.add(head);
    kit.userData.head = head;
    for (const [x, y, z, r] of [[-0.42, 0.62, 0.15, 0.2], [0.3, 0.86, 0.05, 0.16], [-0.12, 0.88, 0.02, 0.15]]) {
      kit.add(outline(M(new THREE.CylinderGeometry(r, r, 0.16, 24), shellMat, x, y, z), 1.04));
      kit.add(M(new THREE.CylinderGeometry(0.012, 0.012, y - 0.08, 8), chrome, x, (y - 0.08) / 2, z));
    }
    for (const [x, y, z, r] of [[-0.7, 1.25, -0.1, 0.3], [0.62, 1.32, -0.15, 0.34]]) {
      const cym = M(new THREE.CylinderGeometry(r, r * 0.92, 0.015, 32), brass, x, y, z);
      cym.rotation.z = x > 0 ? -0.2 : 0.2;
      kit.add(cym);
      kit.add(M(new THREE.CylinderGeometry(0.012, 0.012, y, 8), chrome, x, y / 2, z));
    }
    kit.position.set(-2.15, STAGE_TOP, -4.25);
    kit.rotation.y = 0.35;
    scene.add(kit);
    api_kitHead = head;

    const keys = new THREE.Group();
    const dark = toon('#1f1a24');
    keys.add(outline(M(new THREE.BoxGeometry(1.25, 0.1, 0.36), dark, 0, 0.9, 0), 1.03));
    const keyTop = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.2), new THREE.MeshStandardMaterial({ roughness: 0.6 }));
    keyTop.rotation.x = -Math.PI / 2;
    keyTop.position.set(0, 0.952, 0.06);
    keys.add(keyTop);
    keys.userData.top = keyTop;
    for (const s of [-1, 1]) {
      const leg = M(new THREE.BoxGeometry(0.05, 0.95, 0.05), dark, s * 0.38, 0.45, 0);
      leg.rotation.z = s * 0.35;
      keys.add(leg);
      const leg2 = leg.clone();
      leg2.rotation.z = -s * 0.35;
      keys.add(leg2);
    }
    keys.position.set(2.15, STAGE_TOP, -4.2);
    keys.rotation.y = -0.35;
    scene.add(keys);
    api_keyTop = keyTop;
  }

  // Floor: rug, armchair, floor lamp
  const rugMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(1.5, 1, 1);
  rug.position.set(0, 0.012, 1.9);
  rug.receiveShadow = true;
  scene.add(rug);
  {
    const chair = new THREE.Group();
    const red = toon('#b42a3a');
    chair.add(outline(M(new THREE.BoxGeometry(1.0, 0.42, 0.9), red, 0, 0.36, 0), 1.03));
    chair.add(outline(M(new THREE.BoxGeometry(1.0, 0.9, 0.28), red, 0, 0.8, -0.34), 1.03));
    for (const s of [-1, 1]) chair.add(outline(M(new THREE.BoxGeometry(0.22, 0.62, 0.9), red, s * 0.5, 0.48, 0), 1.04));
    for (let i = 0; i < 3; i++) chair.add(M(new THREE.SphereGeometry(0.035, 8, 6), toon('#f2b322'), -0.25 + i * 0.25, 0.95, -0.19, false));
    chair.position.set(-5.4, 0, -0.2);
    chair.rotation.y = 0.6;
    scene.add(chair);
    const lamp = new THREE.Group();
    lamp.add(M(new THREE.CylinderGeometry(0.22, 0.26, 0.05, 24), toon('#2b1f25'), 0, 0.025, 0));
    lamp.add(M(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 10), toon('#2b1f25'), 0, 0.85, 0));
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 0.42, 24, 1, true), glow('#ffcf8a', 1.25));
    shade.position.y = 1.85;
    lamp.add(shade);
    lamp.position.set(6.6, 0, -1.6);
    scene.add(lamp);
    const lampLight = new THREE.PointLight('#ffb070', 5, 6, 1.6);
    lampLight.position.set(6.6, 1.9, -1.6);
    scene.add(lampLight);
  }

  // Overhead truss with can lights
  {
    const truss = M(new THREE.BoxGeometry(8.2, 0.14, 0.14), toon('#222028'), 0, 6.0, -1.4, false);
    scene.add(truss);
    for (let i = 0; i < 6; i++) {
      const x = -3.4 + i * 1.36;
      const can = new THREE.Group();
      can.add(M(new THREE.CylinderGeometry(0.13, 0.16, 0.36, 18), toon('#18161c'), 0, -0.18, 0, false));
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 18), glow(['#ffd28a', '#ff7a6a', '#7ad8ff'][i % 3], 2.0));
      lens.rotation.x = Math.PI / 2;
      lens.position.y = -0.365;
      can.add(lens);
      can.position.set(x, 5.95, -1.4);
      can.rotation.x = -0.5;
      scene.add(can);
    }
  }

  /* ---------- Lights: soft, warm, no hot spots ---------- */
  const hemi = new THREE.HemisphereLight('#ffe2c6', '#2a1610', 1.25);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight('#ffe9d6', 0.75);
  fill.position.set(2, 6, 8);
  scene.add(fill);
  const key = new THREE.SpotLight('#fff0dc', 30, 0, 0.45, 0.75, 1.4);
  key.position.set(0, 6.2, 1.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.radius = 5;
  scene.add(key, key.target);
  const washes = [['#ff6a5a', -1], ['#5ad8ff', 1]].map(([c, s]) => {
    const l = new THREE.SpotLight(c, 18, 0, 0.6, 0.9, 1.4);
    l.position.set(s * 4, 5.8, -0.5);
    l.target.position.set(s * 0.6, STAGE_TOP, -3);
    scene.add(l, l.target);
    return l;
  });
  const roomFill = new THREE.PointLight('#ffb070', 12, 14, 1.4);
  roomFill.position.set(0, 4.6, 5.2);
  scene.add(roomFill);
  // The marquee actually lights the stage: warm footlights that pulse with the chase
  const footlights = [-2.4, 0, 2.4].map((x) => {
    const l = new THREE.PointLight('#ffc46a', 6, 5.5, 1.6);
    l.position.set(x, STAGE_TOP + 0.25, -0.9);
    scene.add(l);
    return l;
  });
  const BASE = { hemi: 1.25, fill: 0.75, key: 38, wash: 22, room: 12, foot: 6 };

  /* =====================================================================
     Characters
     ===================================================================== */
  /** A hat. `tint` recolors its main part (players pick it in the wardrobe); empty keeps the original. */
  /** A squeaky toy hammer, held in front of the chest. Its pivot is the hands; it swings on rotation.x. */
  function toyHammer() {
    const g = new THREE.Group();
    g.position.set(0, 1.22, 0.3);
    g.scale.setScalar(1.2);
    g.add(outline(M(new THREE.CylinderGeometry(0.035, 0.042, 0.82, 10), toon('#f2b84b'), 0, 0.41, 0), 1.18));
    const head = new THREE.Group();
    head.position.y = 0.88;
    const body = outline(M(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 26), toon('#ff4d3d'), 0, 0, 0), 1.06);
    body.rotation.x = Math.PI / 2;
    head.add(body);
    for (const s of [-1, 1]) {
      const cap = outline(M(new THREE.CylinderGeometry(0.165, 0.165, 0.07, 26), toon('#ffc22e'), 0, 0, s * 0.22), 1.08);
      cap.rotation.x = Math.PI / 2;
      head.add(cap);
    }
    g.add(head);
    return g;
  }
  /** Little yellow stars circling a dazed head. */
  function dizzyStars() {
    const g = new THREE.Group();
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.035 : 0.085;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ExtrudeGeometry(star, { depth: 0.03, bevelEnabled: false });
    for (let i = 0; i < 4; i++) {
      const m = outline(new THREE.Mesh(geo, toon('#ffd23f')), 1.2);
      m.userData.a = (i / 4) * Math.PI * 2;
      g.add(m);
    }
    g.position.y = 1.9;
    return g;
  }

  function accessory(kind, tint) {
    const g = new THREE.Group();
    const TOP = 0.81;
    const tc = (def) => toon(tint || def);
    if (kind === 'sprout') {
      g.add(M(new THREE.CylinderGeometry(0.025, 0.03, 0.2, 8), toon('#1f7a37'), 0, TOP + 0.08, 0));
      for (const s of [-1, 1]) {
        const leaf = outline(M(new THREE.SphereGeometry(0.12, 18, 12), tc('#3fbf5c'), s * 0.1, TOP + 0.2, 0), 1.1);
        leaf.scale.set(1, 0.34, 0.62);
        leaf.rotation.z = -s * 0.5;
        g.add(leaf);
      }
    } else if (kind === 'bow') {
      // Pinned on the surface of the head (up and to the side), tilted with the curve
      const mat = tc('#ff4d6d');
      const bow = new THREE.Group();
      bow.add(outline(M(new THREE.SphereGeometry(0.065, 16, 12), mat, 0, 0, 0), 1.12));
      for (const s of [-1, 1]) {
        const wing = outline(M(new THREE.SphereGeometry(0.12, 18, 12), mat, s * 0.13, 0, 0), 1.07);
        wing.scale.set(1.05, 0.72, 0.42);
        wing.rotation.z = s * 0.25;
        bow.add(wing);
      }
      bow.position.set(0.25, 0.79, 0.13);
      bow.rotation.set(0.25, 0.3, -0.5);
      g.add(bow);
    } else if (kind === 'crown') {
      // A proper royal crown: a flared gold band whose top rises into five points, pearl tips,
      // a jeweled band and a velvet cap inside. The tint recolors the velvet; the gold stays gold.
      const gold = toon('#eea312');
      const deep = toon('#c98a0c');
      const band = new THREE.CylinderGeometry(0.335, 0.318, 0.13, 100, 1, true);
      const pos = band.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) <= 0) continue;
        const f = (((Math.atan2(pos.getX(i), pos.getZ(i)) / (Math.PI * 2)) * 5) % 1 + 1) % 1;
        const d = Math.min(f, 1 - f);
        pos.setY(i, pos.getY(i) + 0.17 * Math.pow(Math.max(0, 1 - d * 2.4), 1.6));
      }
      band.computeVertexNormals();
      const outer = outline(M(band, gold, 0, 0.765, 0), 1.035);
      g.add(outer);
      const inner = new THREE.Mesh(band, deep);
      inner.material = toon('#a86f08');
      inner.material.side = THREE.BackSide;
      inner.scale.set(0.965, 1, 0.965);
      inner.position.y = 0.765;
      g.add(inner);
      // Velvet cap filling the crown
      g.add(M(new THREE.SphereGeometry(0.3, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), toon(tint || '#c0243f'), 0, 0.68, 0));
      // Rims, pearls and jewels
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.322, 0.022, 10, 64), gold);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.7;
      g.add(rim);
      const pearl = toon('#fff4e0');
      const gems = ['#ff3b4e', '#3d8bff', '#25d39b', '#3d8bff', '#ff3b4e'];
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        const sx = Math.sin(ang), sz = Math.cos(ang);
        g.add(outline(M(new THREE.SphereGeometry(0.034, 14, 10), pearl, sx * 0.338, 1.005, sz * 0.338), 1.15));
        const gem = M(new THREE.OctahedronGeometry(0.042, 0), toon(gems[i]), sx * 0.345, 0.77, sz * 0.345);
        gem.scale.set(1, 1.25, 0.55);
        gem.rotation.y = ang;
        g.add(outline(gem, 1.15));
      }
      g.add(outline(M(new THREE.SphereGeometry(0.045, 16, 12), gold, 0, 0.99, 0), 1.12));
      g.rotation.z = -0.07;
    } else if (kind === 'cowboy') {
      const tan = tc('#a8693a');
      const brim = outline(M(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 40), tan, 0, TOP - 0.06, 0), 1.03);
      brim.scale.set(1, 1, 0.85);
      g.add(brim);
      const crownM = outline(M(new THREE.CylinderGeometry(0.26, 0.32, 0.3, 28), tan, 0, TOP + 0.1, 0), 1.04);
      crownM.scale.set(1, 1, 0.85);
      g.add(crownM);
      g.add(M(new THREE.CylinderGeometry(0.325, 0.325, 0.06, 28), toon('#4a2c1a'), 0, TOP + 0.0, 0));
    } else if (kind === 'tophat') {
      const black = tc('#1d1b22');
      g.add(outline(M(new THREE.CylinderGeometry(0.42, 0.42, 0.035, 36), black, 0, TOP - 0.04, 0), 1.04));
      g.add(outline(M(new THREE.CylinderGeometry(0.25, 0.25, 0.42, 30), black, 0, TOP + 0.18, 0), 1.04));
      g.add(M(new THREE.CylinderGeometry(0.255, 0.255, 0.07, 30), toon('#e8463a'), 0, TOP + 0.03, 0));
      g.rotation.z = -0.12;
    } else if (kind === 'catears') {
      const fur = tc('#2a2530');
      const pink = toon('#ff8fb0');
      for (const s of [-1, 1]) {
        const ear = outline(M(new THREE.ConeGeometry(0.13, 0.26, 4), fur, s * 0.25, TOP - 0.02, 0.02), 1.08);
        ear.rotation.set(0, Math.PI / 4, s * -0.35);
        g.add(ear);
        const inner = M(new THREE.ConeGeometry(0.07, 0.15, 4), pink, s * 0.25, TOP - 0.03, 0.07);
        inner.rotation.set(0, Math.PI / 4, s * -0.35);
        g.add(inner);
      }
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.525, 0.028, 8, 48, Math.PI), fur);
      band.position.y = 0.31;
      g.add(band);
    } else if (kind === 'propeller') {
      const cap = M(new THREE.SphereGeometry(0.515, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.36), tc('#3d8bff'), 0, 0.31, 0);
      g.add(cap);
      for (let i = 0; i < 4; i++) {
        const seg = M(new THREE.SphereGeometry(0.517, 16, 8, (i * Math.PI) / 2, Math.PI / 4, 0, Math.PI * 0.36), toon('#ffc22e'), 0, 0.31, 0);
        g.add(seg);
      }
      g.add(M(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), toon('#1d1b22'), 0, TOP + 0.08, 0));
      const blades = new THREE.Group();
      for (const s of [-1, 1]) {
        const b = outline(M(new THREE.BoxGeometry(0.34, 0.015, 0.08), toon(s > 0 ? '#ff4d3d' : '#25d39b'), s * 0.17, 0, 0), 1.1);
        b.rotation.x = s * 0.25;
        blades.add(b);
      }
      blades.position.y = TOP + 0.14;
      blades.userData.spin = true;
      g.add(blades);
    } else if (kind === 'wizard') {
      const blue = tc('#3b3a9e');
      g.add(outline(M(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 36), blue, 0, TOP - 0.08, 0), 1.03));
      const cone = outline(M(new THREE.ConeGeometry(0.28, 0.6, 30), blue, 0.04, TOP + 0.2, 0), 1.04);
      cone.rotation.z = -0.22;
      g.add(cone);
      for (const [x, y, z] of [[0.1, TOP + 0.12, 0.26], [-0.12, TOP + 0.02, 0.27], [0.05, TOP + 0.3, 0.17]]) g.add(M(new THREE.OctahedronGeometry(0.035), toon('#ffc22e'), x, y, z));
    } else if (kind === 'chef') {
      const white = tc('#f3ede4');
      g.add(outline(M(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 30), white, 0, TOP - 0.01, 0), 1.04));
      for (const [x, z] of [[0, 0], [-0.15, 0.08], [0.15, 0.08], [0, -0.15], [-0.12, -0.1], [0.12, -0.1]]) g.add(outline(M(new THREE.SphereGeometry(0.17, 16, 12), white, x, TOP + 0.17, z), 1.05));
    } else if (kind === 'halo') {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 12, 40), glow(tint || '#ffd75a', 1.5));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = TOP + 0.2;
      halo.userData.bob = true;
      g.add(halo);
    } else if (kind === 'headphones') {
      const mat = tc('#1c1c22');
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.535, 0.032, 10, 48, Math.PI), mat);
      band.position.y = 0.31;
      g.add(band);
      for (const s of [-1, 1]) {
        const cup = outline(M(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 24), mat, s * 0.53, 0.28, 0), 1.08);
        cup.rotation.z = Math.PI / 2;
        g.add(cup);
        const pad = M(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20), toon('#e8463a'), s * 0.59, 0.28, 0);
        pad.rotation.z = Math.PI / 2;
        g.add(pad);
      }
    } else if (kind === 'cap') {
      const mat = tc('#1d2a44');
      g.add(M(new THREE.SphereGeometry(0.515, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.36), mat, 0, 0.31, 0));
      const brim = outline(M(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 32, 1, false, -Math.PI / 2, Math.PI), mat, 0, 0.76, 0.32), 1.06);
      brim.scale.set(1, 1, 0.9);
      brim.rotation.x = 0.12;
      g.add(brim);
    } else if (kind === 'party') {
      const c = outline(M(new THREE.ConeGeometry(0.2, 0.44, 28), tc('#f3ece4'), 0.06, TOP + 0.17, 0), 1.06);
      c.rotation.z = -0.18;
      g.add(c);
      g.add(outline(M(new THREE.SphereGeometry(0.065, 14, 10), toon('#f2b322'), 0.1, TOP + 0.4, 0), 1.12));
      for (let i = 0; i < 2; i++) {
        const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.15 - i * 0.06, 0.016, 6, 28), toon('#e8463a'));
        stripe.rotation.x = Math.PI / 2;
        stripe.position.set(0.065 + i * 0.02, TOP + 0.08 + i * 0.13, 0);
        g.add(stripe);
      }
    } else if (kind === 'beanie') {
      const mat = tc('#2a2a32');
      const th = Math.PI * 0.34;
      g.add(M(new THREE.SphereGeometry(0.52, 32, 16, 0, Math.PI * 2, 0, th), mat, 0, 0.31, 0));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52 * Math.sin(th), 0.055, 10, 40), mat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.31 + 0.52 * Math.cos(th);
      g.add(rim);
      g.add(outline(M(new THREE.SphereGeometry(0.09, 14, 10), mat, 0, TOP + 0.05, 0), 1.1));
    } else if (kind === 'viking') {
      const metal = tc('#9aa3b5');
      g.add(outline(M(new THREE.SphereGeometry(0.525, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.36), metal, 0, 0.31, 0), 1.03));
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.045, 10, 44), toon('#c98a0c'));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.58;
      g.add(band);
      for (const s of [-1, 1]) {
        // Curved horns: a cone bent out and up
        const horn = outline(M(new THREE.ConeGeometry(0.075, 0.42, 16), toon('#f1e6cf'), s * 0.5, 0.78, 0), 1.08);
        horn.rotation.z = -s * 0.75;
        g.add(horn);
      }
    } else if (kind === 'bandana') {
      const red = tc('#e8463a');
      g.add(M(new THREE.SphereGeometry(0.518, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.3), red, 0, 0.31, 0));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        g.add(M(new THREE.SphereGeometry(0.022, 8, 6), toon('#fff4e0'), Math.sin(a) * 0.36, 0.73, Math.cos(a) * 0.36));
      }
      for (const s of [-1, 1]) {
        const tail = outline(M(new THREE.CapsuleGeometry(0.05, 0.16, 4, 10), red, s * 0.08, 0.6, -0.5), 1.1);
        tail.rotation.set(0.5, 0, s * 0.6);
        g.add(tail);
      }
    } else if (kind === 'beret') {
      const b = outline(M(new THREE.SphereGeometry(0.42, 28, 14), tc('#d63c3c'), 0.08, 0.78, 0), 1.04);
      b.scale.set(1.12, 0.3, 1.05);
      b.rotation.z = -0.22;
      g.add(b);
      g.add(M(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8), toon('#1d1b22'), 0.1, 0.9, 0));
    } else if (kind === 'bunny') {
      const fur = tc('#ece5da');
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.set(s * 0.17, 0.74, 0);
        ear.rotation.z = -s * 0.18 + (s > 0 ? -0.35 : 0);
        const outer = outline(M(new THREE.SphereGeometry(0.1, 16, 12), fur, 0, 0.28, 0), 1.06);
        outer.scale.set(0.85, 3, 0.5);
        ear.add(outer);
        const inner = M(new THREE.SphereGeometry(0.06, 14, 10), toon('#ff9fbd'), 0, 0.28, 0.035);
        inner.scale.set(0.8, 3.2, 0.4);
        ear.add(inner);
        g.add(ear);
      }
    } else if (kind === 'flowers') {
      // A flower crown: little daisies and blossoms around the head
      const petals = ['#ff7aa2', '#ffffff', '#ffd23f', '#a98bff', '#ff8c42', '#ffffff', '#ff7aa2'];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const f = new THREE.Group();
        f.position.set(Math.sin(a) * 0.36, 0.7, Math.cos(a) * 0.36);
        f.lookAt(Math.sin(a) * 2, 0.9, Math.cos(a) * 2);
        const pm = toon(petals[i % petals.length]);
        for (let k = 0; k < 5; k++) {
          const pa = (k / 5) * Math.PI * 2;
          const p = M(new THREE.SphereGeometry(0.045, 10, 8), pm, Math.cos(pa) * 0.05, Math.sin(pa) * 0.05, 0);
          p.scale.set(1, 1, 0.45);
          f.add(p);
        }
        f.add(M(new THREE.SphereGeometry(0.03, 10, 8), toon('#f2b322'), 0, 0, 0.02));
        g.add(f);
      }
      const vine = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.016, 6, 40), toon('#3fbf5c'));
      vine.rotation.x = Math.PI / 2;
      vine.position.y = 0.7;
      g.add(vine);
    } else if (kind === 'mohawk') {
      // A crest of spikes front to back, growing taller toward the back so they stack up from the front
      const hair = tc('#ff3d8b');
      for (let i = 0; i < 7; i++) {
        const a = -0.95 + (i / 6) * 1.9;
        const len = 0.2 + (i / 6) * 0.18;
        const spike = outline(M(new THREE.ConeGeometry(0.09, len, 14), hair, 0, 0.31 + Math.cos(a) * (0.5 + len / 2), -Math.sin(a) * (0.5 + len / 2)), 1.08);
        // Fan them out a little, alternating sides, so the crest reads from the front too
        const side = (i % 2 ? 1 : -1) * (0.18 + (i / 6) * 0.12);
        const pivot = new THREE.Group();
        pivot.position.y = 0.31;
        pivot.rotation.z = side;
        spike.position.y -= 0.31;
        spike.rotation.x = -a;
        spike.scale.x = 0.75;
        pivot.add(spike);
        g.add(pivot);
      }
    } else if (kind === 'santa') {
      const red = tc('#e8333a');
      const hat = new THREE.Group();
      hat.add(outline(M(new THREE.ConeGeometry(0.4, 0.62, 28), red, 0, 0.98, 0), 1.03));
      hat.rotation.z = -0.25;
      hat.position.x = 0.05;
      g.add(hat);
      const fur = toon('#f6f1e8');
      const rim = outline(M(new THREE.TorusGeometry(0.43, 0.075, 12, 40), fur, 0, 0.66, 0), 1.04);
      rim.rotation.x = Math.PI / 2;
      g.add(rim);
      g.add(outline(M(new THREE.SphereGeometry(0.08, 14, 10), fur, 0.34, 1.24, 0), 1.08));
    } else if (kind === 'unicorn') {
      const horn = outline(M(new THREE.ConeGeometry(0.075, 0.42, 20), toon('#ffd75a'), 0, 0.98, 0.16), 1.06);
      horn.rotation.x = 0.35;
      g.add(horn);
      for (let i = 0; i < 3; i++) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.06 - i * 0.015, 0.008, 6, 20), toon('#ff9ecf'));
        band.position.set(0, 0.86 + i * 0.1, 0.12 + i * 0.035);
        band.rotation.x = Math.PI / 2 + 0.35;
        g.add(band);
      }
      for (const s of [-1, 1]) {
        const ear = outline(M(new THREE.ConeGeometry(0.07, 0.16, 4), tc('#ece5da'), s * 0.28, 0.76, -0.02), 1.08);
        ear.rotation.z = -s * 0.5;
        g.add(ear);
      }
    } else if (kind === 'devil') {
      for (const s of [-1, 1]) {
        const horn = outline(M(new THREE.ConeGeometry(0.065, 0.22, 14), tc('#e8333a'), s * 0.24, 0.8, 0.06), 1.08);
        horn.rotation.z = -s * 0.42;
        g.add(horn);
      }
    } else if (kind === 'antennae') {
      for (const s of [-1, 1]) {
        const stalk = M(new THREE.CylinderGeometry(0.014, 0.014, 0.38, 8), toon('#1d1b22'), s * 0.14, 0.94, 0);
        stalk.rotation.z = -s * 0.3;
        g.add(stalk);
        g.add(outline(M(new THREE.SphereGeometry(0.06, 14, 10), tc('#7cff6a'), s * 0.2, 1.13, 0), 1.1));
      }
    } else if (kind === 'grad') {
      const black = tc('#1d1b22');
      g.add(M(new THREE.CylinderGeometry(0.31, 0.33, 0.14, 28), black, 0, 0.74, 0));
      const board = outline(M(new THREE.BoxGeometry(0.72, 0.035, 0.72), black, 0, 0.83, 0), 1.04);
      board.rotation.y = Math.PI / 4;
      g.add(board);
      g.add(M(new THREE.SphereGeometry(0.025, 8, 6), toon('#f2b322'), 0, 0.855, 0));
      const cord = M(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), toon('#f2b322'), 0.3, 0.74, 0.18);
      g.add(cord);
      g.add(M(new THREE.ConeGeometry(0.03, 0.08, 8), toon('#f2b322'), 0.3, 0.6, 0.18));
    } else if (kind === 'sombrero') {
      const straw = tc('#e2b55c');
      g.add(outline(M(new THREE.CylinderGeometry(0.88, 0.88, 0.035, 48), straw, 0, 0.66, 0), 1.02));
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.04, 8, 56), straw);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = 0.69;
      g.add(lip);
      g.add(outline(M(new THREE.CylinderGeometry(0.2, 0.32, 0.36, 28), straw, 0, 0.85, 0), 1.04));
      g.add(M(new THREE.CylinderGeometry(0.325, 0.325, 0.06, 28), toon('#e8333a'), 0, 0.71, 0));
    } else if (kind === 'sweatband') {
      const band = outline(M(new THREE.TorusGeometry(0.455, 0.055, 12, 44), tc('#ff4d3d'), 0, 0.53, 0), 1.03);
      band.rotation.x = Math.PI / 2;
      g.add(band);
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.016, 6, 44), toon('#f6f1e8'));
      stripe.rotation.x = Math.PI / 2;
      stripe.position.y = 0.53;
      g.add(stripe);
    } else if (kind === 'pirate') {
      const black = tc('#1d1b22');
      g.add(M(new THREE.SphereGeometry(0.52, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.3), black, 0, 0.31, 0));
      // A bicorne: a half-moon standing side to side across the head
      const sh = new THREE.Shape();
      sh.moveTo(-0.62, 0); sh.quadraticCurveTo(-0.5, 0.42, 0, 0.46); sh.quadraticCurveTo(0.5, 0.42, 0.62, 0); sh.quadraticCurveTo(0, 0.12, -0.62, 0);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
      geo.translate(0, 0, -0.08);
      g.add(outline(new THREE.Mesh(geo, black), 1.03).translateY(0.66));
      const skull = new THREE.Mesh(new THREE.CircleGeometry(0.06, 18), toon('#f6f1e8'));
      skull.position.set(0, 0.92, 0.105);
      g.add(skull);
    } else if (kind === 'mushroom') {
      const cap = outline(M(new THREE.SphereGeometry(0.6, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), tc('#e8333a'), 0, 0.56, 0), 1.03);
      cap.scale.y = 0.62;
      g.add(cap);
      // White spots placed on the flattened cap's surface, facing outward
      const spot = new THREE.MeshBasicMaterial({ color: '#fff6e8' });
      [[0.1, 0.85, 0.5, 0.1], [0.75, 0.45, 0.45, 0.08], [-0.7, 0.5, 0.5, 0.085], [0.35, 0.75, -0.55, 0.075], [-0.4, 0.8, -0.45, 0.07], [0, 1, 0, 0.08]].forEach(([dx, dy, dz, r]) => {
        const n = new THREE.Vector3(dx, dy, dz).normalize();
        const d = new THREE.Mesh(new THREE.CircleGeometry(r, 18), spot);
        d.position.set(n.x * 0.605, 0.56 + n.y * 0.605 * 0.62, n.z * 0.605);
        d.lookAt(d.position.x + n.x, d.position.y + n.y * 1.6, d.position.z + n.z);
        g.add(d);
      });
    } else if (kind === 'buns') {
      // Space buns: a little hair on top and two buns with pink ties
      const hair = tc('#3a2418');
      g.add(M(new THREE.SphereGeometry(0.518, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.3), hair, 0, 0.31, 0));
      for (const s of [-1, 1]) {
        g.add(outline(M(new THREE.SphereGeometry(0.17, 20, 14), hair, s * 0.31, 0.78, -0.05), 1.05));
        const tie = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 24), toon('#ff7aa2'));
        tie.position.set(s * 0.26, 0.7, -0.04);
        tie.rotation.set(Math.PI / 2, 0, s * 0.55);
        g.add(tie);
      }
    } else if (kind === 'astronaut') {
      // A glass fishbowl helmet with a white collar ring
      const glass = new THREE.Mesh(new THREE.SphereGeometry(0.66, 36, 24), new THREE.MeshBasicMaterial({ color: '#d8ecff', transparent: true, opacity: 0.14, depthWrite: false }));
      glass.position.y = 0.32;
      g.add(glass);
      const collar = outline(M(new THREE.TorusGeometry(0.515, 0.065, 12, 48), tc('#f2f2f6'), 0, -0.24, 0), 1.03);
      collar.rotation.x = Math.PI / 2;
      g.add(collar);
      const shine = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 30, Math.PI * 0.35), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
      shine.position.set(0, 0.32, 0.3);
      shine.rotation.set(-0.6, 0, Math.PI * 0.55);
      g.add(shine);
    } else if (kind === 'frog') {
      const green = tc('#5fd35f');
      g.add(outline(M(new THREE.SphereGeometry(0.525, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.33), green, 0, 0.31, 0), 1.03));
      for (const s of [-1, 1]) {
        g.add(outline(M(new THREE.SphereGeometry(0.12, 18, 14), green, s * 0.2, 0.8, 0.14), 1.06));
        g.add(M(new THREE.SphereGeometry(0.085, 16, 12), new THREE.MeshBasicMaterial({ color: '#f6f2ec' }), s * 0.2, 0.83, 0.2));
        g.add(M(new THREE.SphereGeometry(0.042, 12, 10), PUPIL, s * 0.2, 0.84, 0.27));
      }
    } else if (kind === 'bear') {
      const fur = tc('#8a5a2b');
      g.add(outline(M(new THREE.SphereGeometry(0.525, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.32), fur, 0, 0.31, 0), 1.03));
      for (const s of [-1, 1]) {
        const ear = outline(M(new THREE.SphereGeometry(0.13, 18, 14), fur, s * 0.33, 0.74, 0), 1.06);
        ear.scale.z = 0.6;
        g.add(ear);
        const inner = M(new THREE.SphereGeometry(0.075, 14, 10), toon('#e8a07a'), s * 0.33, 0.74, 0.06);
        inner.scale.z = 0.4;
        g.add(inner);
      }
    } else if (kind === 'jester') {
      // Three floppy points with golden bells
      const cols = [tc('#a98bff'), toon('#ffc22e'), tc('#a98bff')];
      g.add(outline(M(new THREE.CylinderGeometry(0.36, 0.4, 0.14, 30), toon('#ffc22e'), 0, 0.68, 0), 1.04));
      [[-1.05, 0, 0], [1.05, 0, 0], [0, 0, -1.0]].forEach(([rz, ry, rx], i) => {
        const arm = new THREE.Group();
        arm.position.y = 0.72;
        arm.rotation.set(rx, ry, rz);
        const cone = outline(M(new THREE.ConeGeometry(0.15, 0.48, 18), cols[i], 0, 0.26, 0), 1.05);
        arm.add(cone);
        arm.add(outline(M(new THREE.SphereGeometry(0.055, 12, 10), toon('#f2b322'), 0, 0.52, 0), 1.1));
        g.add(arm);
      });
    } else if (kind === 'fez') {
      g.add(outline(M(new THREE.CylinderGeometry(0.2, 0.26, 0.3, 28), tc('#c3271a'), 0, 0.86, 0), 1.04));
      g.add(rod([0, 1.01, 0], [0.16, 0.92, 0.12], 0.01, toon('#1d1b22')));
      g.add(M(new THREE.SphereGeometry(0.035, 10, 8), toon('#1d1b22'), 0.17, 0.88, 0.13));
    } else if (kind === 'bucket') {
      const cloth = tc('#5f9e4f');
      g.add(outline(M(new THREE.CylinderGeometry(0.36, 0.43, 0.28, 30), cloth, 0, 0.78, 0), 1.03));
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.68, 0.14, 40, 1, true), toon(tint || '#5f9e4f', { side: THREE.DoubleSide }));
      brim.position.y = 0.6;
      g.add(brim);
      g.add(M(new THREE.CylinderGeometry(0.435, 0.435, 0.05, 30), toon('#2f5a26'), 0, 0.67, 0));
    } else if (kind === 'backcap') {
      // A baseball cap worn backwards
      const mat = tc('#e8463a');
      g.add(M(new THREE.SphereGeometry(0.515, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.36), mat, 0, 0.31, 0));
      const brim = outline(M(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 32, 1, false, Math.PI / 2, Math.PI), mat, 0, 0.76, -0.32), 1.06);
      brim.scale.set(1, 1, 0.9);
      brim.rotation.x = -0.12;
      g.add(brim);
      g.add(M(new THREE.SphereGeometry(0.045, 10, 8), toon('#ffffff'), 0, 0.82, 0));
    } else if (kind === 'afro') {
      // Big fluffy hair: a cloud of overlapping puffs
      const hair = tc('#3a2418');
      const puffs = [[0, 0.98, 0, 0.36], [0.3, 0.9, 0.05, 0.27], [-0.3, 0.9, 0.05, 0.27], [0.18, 1.08, -0.15, 0.26], [-0.18, 1.08, -0.15, 0.26],
        [0.4, 0.68, -0.05, 0.22], [-0.4, 0.68, -0.05, 0.22], [0, 0.88, -0.3, 0.3], [0.22, 0.78, 0.22, 0.2], [-0.22, 0.78, 0.22, 0.2], [0, 1.02, 0.18, 0.24]];
      for (const [x, y, z, r] of puffs) g.add(outline(M(new THREE.SphereGeometry(r, 18, 12), hair, x, y, z), 1.04));
    }
    return g;
  }

  /* Face extras, in the torso's local space. Eyes sit at (±0.17, 0.2) and their fronts reach z 0.5;
     the face is the side of a 0.5-radius cylinder, so anything lying on it is bent to that curve. */
  const roundRect = (w, h, r, sh = new THREE.Shape()) => {
    const x = -w / 2, y = -h / 2;
    sh.moveTo(x + r, y);
    sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
    sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
    sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
    return sh;
  };
  const wayfarer = (w, h, sh = new THREE.Shape()) => {
    // Wider at the top, softly rounded at the bottom
    sh.moveTo(-w / 2, h / 2);
    sh.lineTo(w / 2, h / 2);
    sh.bezierCurveTo(w / 2, -h * 0.1, w * 0.42, -h / 2, w * 0.12, -h / 2);
    sh.lineTo(-w * 0.12, -h / 2);
    sh.bezierCurveTo(-w * 0.42, -h / 2, -w / 2, -h * 0.1, -w / 2, h / 2);
    return sh;
  };
  const heart = (k, sh = new THREE.Shape()) => {
    sh.moveTo(0, -0.13 * k);
    sh.bezierCurveTo(-0.05 * k, -0.08 * k, -0.17 * k, -0.02 * k, -0.15 * k, 0.06 * k);
    sh.bezierCurveTo(-0.13 * k, 0.14 * k, -0.03 * k, 0.15 * k, 0, 0.07 * k);
    sh.bezierCurveTo(0.03 * k, 0.15 * k, 0.13 * k, 0.14 * k, 0.15 * k, 0.06 * k);
    sh.bezierCurveTo(0.17 * k, -0.02 * k, 0.05 * k, -0.08 * k, 0, -0.13 * k);
    return sh;
  };
  const circle = (r, sh = new THREE.Shape()) => { sh.absarc(0, 0, r, 0, Math.PI * 2, false); return sh; };
  /** A frame (outer shape minus the lens shape) plus a see-through lens with a glint. */
  function lensPair(make, frameMat, lensMat, sides = [-1, 1], at = { x: 0.175, y: 0.215, z: 0.525 }) {
    const g = new THREE.Group();
    for (const s of sides) {
      const outer = make(true);
      outer.holes.push(make(false));
      const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.028, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2, curveSegments: 20 }), frameMat);
      frame.position.set(s * at.x, at.y, at.z - 0.014);
      g.add(frame);
      const lens = new THREE.Mesh(new THREE.ShapeGeometry(make(false), 20), lensMat);
      lens.position.set(s * at.x, at.y, at.z);
      g.add(lens);
      const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.13), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.42, depthWrite: false }));
      glint.position.set(s * at.x - 0.04, at.y + 0.01, at.z + 0.004);
      glint.rotation.z = -0.6;
      g.add(glint);
    }
    return g;
  }
  /** A thin rod between two points (glasses arms, bridges). */
  function rod(a, b, r, mat) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 8), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    return m;
  }
  /**
   * Split a geometry into small triangles (longest edge first, keeping the winding), so that when it
   * is bent onto a curved surface every part follows the curve instead of cutting through it.
   */
  function refine(geo, maxLen = 0.03) {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const p = src.attributes.position.array;
    const tris = [];
    for (let i = 0; i < p.length; i += 9) tris.push([[p[i], p[i + 1], p[i + 2]], [p[i + 3], p[i + 4], p[i + 5]], [p[i + 6], p[i + 7], p[i + 8]]]);
    const out = [];
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    while (tris.length) {
      const [a, b, c] = tris.pop();
      const ab = len(a, b), bc = len(b, c), ca = len(c, a), m = Math.max(ab, bc, ca);
      if (m <= maxLen) { out.push(...a, ...b, ...c); continue; }
      if (m === ab) { const d = mid(a, b); tris.push([a, d, c], [d, b, c]); }
      else if (m === bc) { const d = mid(b, c); tris.push([a, b, d], [a, d, c]); }
      else { const d = mid(c, a); tris.push([a, b, d], [d, b, c]); }
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    return ng;
  }
  /** Bend flat geometry (built around z = 0) onto the face's curve. */
  function hugFace(geo, lift = 0.006) {
    geo = refine(geo);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, pos.getZ(i) + Math.sqrt(Math.max(0, 0.25 - x * x)) - 0.5 + lift);
    }
    geo.computeVertexNormals();
    return geo;
  }
  function faceExtra(kind, eyes) {
    const g = new THREE.Group();
    g.userData.attached = [];
    const glass = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const arms = (mat, x, y) => { for (const s of [-1, 1]) g.add(rod([s * x, y, 0.52], [s * 0.47, y + 0.01, 0.16], 0.014, mat)); };
    if (kind === 'glasses') {
      const frame = toon('#1b1820');
      g.add(lensPair((outer) => roundRect(outer ? 0.33 : 0.27, outer ? 0.29 : 0.23, outer ? 0.11 : 0.08), frame, glass('#cfe8ff', 0.12)));
      g.add(rod([-0.03, 0.25, 0.53], [0.03, 0.25, 0.53], 0.016, frame));
      arms(frame, 0.33, 0.25);
    } else if (kind === 'shades') {
      const frame = toon('#141218');
      g.add(lensPair((outer) => wayfarer(outer ? 0.35 : 0.29, outer ? 0.26 : 0.2), frame, glass('#16121e', 0.8)));
      g.add(rod([-0.03, 0.27, 0.53], [0.03, 0.27, 0.53], 0.018, frame));
      arms(frame, 0.34, 0.28);
    } else if (kind === 'hearts') {
      const frame = toon('#e8336a');
      g.add(lensPair((outer) => heart(outer ? 1.18 : 0.98), frame, glass('#ff6f9c', 0.55), [-1, 1], { x: 0.178, y: 0.2, z: 0.525 }));
      g.add(rod([-0.03, 0.24, 0.53], [0.03, 0.24, 0.53], 0.016, frame));
      arms(frame, 0.34, 0.24);
    } else if (kind === 'monocle') {
      const gold = toon('#e0a92a');
      g.add(lensPair((outer) => circle(outer ? 0.175 : 0.148), gold, glass('#d9f0ff', 0.14), [1], { x: 0.17, y: 0.205, z: 0.525 }));
      const chain = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.3, 0.1, 0.5), new THREE.Vector3(0.37, -0.02, 0.4), new THREE.Vector3(0.4, -0.14, 0.31), new THREE.Vector3(0.45, -0.24, 0.2),
      ]), 24, 0.008, 6), gold);
      g.add(chain);
    } else if (kind === 'mustache') {
      // A handlebar mustache: one flat silhouette, then curved onto the face
      const sh = new THREE.Shape();
      sh.moveTo(0, 0.03);
      sh.bezierCurveTo(0.05, 0.065, 0.13, 0.055, 0.17, 0.0);
      sh.bezierCurveTo(0.19, -0.02, 0.23, 0.0, 0.245, 0.055);
      sh.bezierCurveTo(0.225, 0.015, 0.19, -0.045, 0.14, -0.045);
      sh.bezierCurveTo(0.08, -0.045, 0.03, -0.012, 0, -0.005);
      sh.bezierCurveTo(-0.03, -0.012, -0.08, -0.045, -0.14, -0.045);
      sh.bezierCurveTo(-0.19, -0.045, -0.225, 0.015, -0.245, 0.055);
      sh.bezierCurveTo(-0.23, 0.0, -0.19, -0.02, -0.17, 0.0);
      sh.bezierCurveTo(-0.13, 0.055, -0.05, 0.065, 0, 0.03);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 18 });
      geo.scale(0.82, 0.82, 1);
      const m = outline(new THREE.Mesh(hugFace(geo, 0.004), toon('#3a2418')), 1.05);
      m.position.set(0, 0.012, 0.5);
      g.add(m);
    } else if (kind === 'freckles') {
      const dot = new THREE.MeshBasicMaterial({ color: '#b5653f', transparent: true, opacity: 0.7 });
      for (const s of [-1, 1]) {
        for (const [dx, dy] of [[0, 0.06], [0.06, 0.035], [-0.05, 0.03], [0.02, -0.005]]) {
          const f = new THREE.Mesh(new THREE.CircleGeometry(0.014, 10), dot);
          const x = s * (0.27 + dx);
          f.position.set(x, dy + 0.02, Math.sqrt(0.25 - x * x) + 0.004);
          f.lookAt(f.position.x * 3, f.position.y, f.position.z * 3);
          g.add(f);
        }
      }
    } else if (kind === 'lashes') {
      // Three lashes on the outer top edge of each eye; they live on the eye so they blink with it
      const mat = toon('#16121c');
      eyes?.forEach((eye, i) => {
        const s = i === 0 ? -1 : 1;
        for (const th of [0.55, 0.95, 1.3]) {
          const lash = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.045, 4, 6), mat);
          const ex = s * 0.13 * Math.cos(th), ey = 0.1456 * Math.sin(th);
          lash.position.set(ex * 1.22, ey * 1.18, 0.03);
          lash.rotation.z = s * (th - Math.PI / 2);
          eye.add(lash);
          g.userData.attached.push([eye, lash]);
        }
      });
    } else if (kind === 'beard') {
      // A full beard that frames the mouth (the mouth stays visible above it)
      const sh = new THREE.Shape();
      sh.moveTo(-0.34, 0.06);
      sh.bezierCurveTo(-0.34, -0.25, -0.15, -0.36, 0, -0.36);
      sh.bezierCurveTo(0.15, -0.36, 0.34, -0.25, 0.34, 0.06);
      sh.bezierCurveTo(0.28, -0.02, 0.2, -0.09, 0.12, -0.11);
      sh.bezierCurveTo(0.05, -0.15, -0.05, -0.15, -0.12, -0.11);
      sh.bezierCurveTo(-0.2, -0.09, -0.28, -0.02, -0.34, 0.06);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 16 });
      const beard = outline(new THREE.Mesh(hugFace(geo, 0.004), toon('#4a2c1a')), 1.03);
      beard.position.set(0, -0.06, 0.5);
      g.add(beard);
    } else if (kind === 'eyepatch') {
      const black = toon('#1b1820');
      const pg = new THREE.CircleGeometry(0.135, 24);
      pg.scale(1, 1.12, 1);
      pg.translate(0.17, 0, 0);
      const patch = outline(new THREE.Mesh(hugFace(pg, 0.075), black), 1.02);
      patch.position.set(0, 0.2, 0.5);
      g.add(patch);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.505, 0.014, 6, 48, Math.PI * 1.15), black);
      strap.rotation.set(Math.PI / 2, -0.45, -Math.PI * 0.08);
      strap.position.y = 0.28;
      g.add(strap);
    } else if (kind === 'clown') {
      g.add(outline(M(new THREE.SphereGeometry(0.075, 18, 14), toon('#ff3b3b'), 0, 0.06, 0.52), 1.08));
      g.add(M(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), -0.025, 0.09, 0.585));
    } else if (kind === 'bandit') {
      // A black mask band across the eyes, with eye holes
      const sh = new THREE.Shape();
      sh.moveTo(-0.4, 0.07); sh.quadraticCurveTo(0, 0.13, 0.4, 0.07); sh.lineTo(0.4, -0.08); sh.quadraticCurveTo(0, -0.02, -0.4, -0.08); sh.lineTo(-0.4, 0.07);
      for (const x of [-0.17, 0.17]) { const h = new THREE.Path(); h.absellipse(x, 0, 0.1, 0.085, 0, Math.PI * 2, true); sh.holes.push(h); }
      const mask = new THREE.Mesh(hugFace(new THREE.ShapeGeometry(sh, 20), 0.028), toon('#1b1820'));
      mask.position.set(0, 0.2, 0.5);
      g.add(mask);
    } else if (kind === 'stickers') {
      const cols = ['#ffd23f', '#ff7aa2', '#3dd6ff'];
      [[-0.3, -0.04, 0.05], [0.33, 0.04, 0.04], [0.24, 0.42, 0.035]].forEach(([x, y, r], i) => {
        const sg = new THREE.ShapeGeometry(starShape(r, r * 0.45));
        sg.translate(x, 0, 0);
        const st = new THREE.Mesh(hugFace(sg, 0.01), new THREE.MeshBasicMaterial({ color: cols[i] }));
        st.position.set(0, y, 0.5);
        g.add(st);
      });
    } else if (kind === 'whiskers') {
      const ink = toon('#2a2530');
      for (const s of [-1, 1]) for (const [y0, dy] of [[0.03, 0.05], [-0.01, 0], [-0.05, -0.05]]) {
        g.add(rod([s * 0.2, y0, bodyZ(0.2, y0) + 0.01], [s * 0.44, y0 + dy, bodyZ(0.44, y0 + dy) + 0.04], 0.007, ink));
      }
      g.add(outline(M(new THREE.SphereGeometry(0.035, 12, 10), toon('#ff8fb0'), 0, 0.04, 0.505), 1.1));
    } else if (kind === 'pixel') {
      // 8-bit "deal with it" shades: blocky black pixels with two white glints
      const px = new THREE.MeshBasicMaterial({ color: '#111015' });
      const z = 0.55;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.055, 0.03), px).translateY(0.275).translateZ(z));
      for (const s of [-1, 1]) {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.11, 0.03), px).translateX(s * 0.18).translateY(0.195).translateZ(z));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.055, 0.03), px).translateX(s * 0.18 + s * 0.02).translateY(0.115).translateZ(z));
        const w = new THREE.MeshBasicMaterial({ color: '#ffffff' });
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.01), w).translateX(s * 0.18 - 0.08).translateY(0.22).translateZ(z + 0.02));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.01), w).translateX(s * 0.18 - 0.035).translateY(0.175).translateZ(z + 0.02));
        g.add(rod([s * 0.4, 0.275, z], [s * 0.47, 0.27, 0.16], 0.014, px));
      }
    } else if (kind === 'goggles') {
      // Swim goggles: tinted lenses, chunky rims and a strap round the head
      const rim = toon('#2bc8c4');
      for (const s of [-1, 1]) {
        const ring = outline(M(new THREE.TorusGeometry(0.145, 0.03, 10, 30), rim, s * 0.175, 0.205, 0.525), 1.06);
        g.add(ring);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.14, 28), new THREE.MeshBasicMaterial({ color: '#8fe3ff', transparent: true, opacity: 0.35, depthWrite: false }));
        lens.position.set(s * 0.175, 0.205, 0.53);
        g.add(lens);
        const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }));
        glint.position.set(s * 0.175 - 0.05, 0.22, 0.535);
        glint.rotation.z = -0.6;
        g.add(glint);
      }
      g.add(rod([-0.03, 0.21, 0.535], [0.03, 0.21, 0.535], 0.016, rim));
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.505, 0.022, 6, 48, Math.PI * 1.25), rim);
      strap.rotation.set(Math.PI / 2, 0, Math.PI * 0.375 + Math.PI);
      strap.position.y = 0.21;
      g.add(strap);
    } else if (kind === 'heartcheeks') {
      for (const s of [-1, 1]) {
        const hg = new THREE.ShapeGeometry(heart(0.72), 14);
        hg.translate(s * 0.29, 0, 0);
        const h = new THREE.Mesh(hugFace(hg, 0.035), new THREE.MeshBasicMaterial({ color: '#ff4f86' }));
        h.position.set(0, 0.0, 0.5);
        g.add(h);
      }
    } else if (kind === 'disguise') {
      // The classic disguise: thick glasses, a big nose, bushy brows and a mustache
      const black = toon('#1b1820');
      for (const s of [-1, 1]) {
        g.add(outline(M(new THREE.TorusGeometry(0.13, 0.028, 10, 30), black, s * 0.175, 0.2, 0.53), 1.05));
        const brow = outline(M(new THREE.CapsuleGeometry(0.035, 0.16, 4, 10), black, s * 0.18, 0.37, 0.48), 1.06);
        brow.rotation.z = Math.PI / 2 + s * 0.08;
        g.add(brow);
        g.add(rod([s * 0.3, 0.22, 0.53], [s * 0.47, 0.22, 0.16], 0.014, black));
        const tache = outline(M(new THREE.SphereGeometry(0.075, 14, 10), black, s * 0.075, -0.015, 0.5), 1.06);
        tache.scale.set(1.2, 0.5, 0.5);
        tache.rotation.z = s * 0.25;
        g.add(tache);
      }
      g.add(rod([-0.045, 0.22, 0.535], [0.045, 0.22, 0.535], 0.016, black));
      const nose = outline(M(new THREE.SphereGeometry(0.085, 18, 14), toon('#f2a07b'), 0, 0.07, 0.535), 1.06);
      nose.scale.set(0.9, 1.15, 1);
      g.add(nose);
    } else if (kind === 'bandage') {
      const patch = new THREE.Group();
      const tape = M(new THREE.BoxGeometry(0.17, 0.062, 0.012), toon('#f4cfa6'), 0, 0, 0, false);
      patch.add(outline(tape, 1.06));
      patch.add(M(new THREE.BoxGeometry(0.055, 0.05, 0.016), toon('#e3ad7f'), 0, 0, 0.002, false));
      const x = -0.3;
      patch.position.set(x, -0.005, Math.sqrt(0.25 - x * x) + 0.008);
      patch.rotation.set(0, Math.asin(x / 0.5), 0.5);
      g.add(patch);
    }
    return g;
  }
  function dropExtra(g) { for (const [parent, o] of g.userData.attached || []) parent.remove(o); }

  /*
   * The body is a capsule: radius 0.5, straight from y -0.31 to 0.31 (torso space), rounding in above
   * and below. bodyZ gives the front surface at (x, y), so anything worn can sit exactly on it.
   */
  const bodyR = (y) => { const k = Math.abs(y) - 0.31; return k <= 0 ? 0.5 : Math.sqrt(Math.max(0, 0.25 - k * k)); };
  const bodyZ = (x, y) => Math.sqrt(Math.max(0, bodyR(y) ** 2 - x * x));
  const onBody = (x, y, lift = 0.012) => new THREE.Vector3(x, y, bodyZ(x, y) + lift);
  /** Bend flat geometry (built around z = 0, then placed at height oy) onto the body's front. */
  function hugBody(geo, lift = 0.008, oy = 0) {
    geo = refine(geo);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + bodyZ(pos.getX(i), pos.getY(i) + oy) + lift);
    geo.computeVertexNormals();
    return geo;
  }
  /** A strap or ribbon that follows the body through the given (x, y) points. */
  const strapOn = (pts, r, mat, lift = 0.014) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y]) => onBody(x, y, lift))), 40, r, 6), mat);

  /** Outfits, worn around the neck, chest and back (torso space: the mouth is near y -0.08, the chest around -0.3). */
  function outfit(kind) {
    const g = new THREE.Group();
    const bow = (y, mat, knotMat, size = 1) => {
      for (const s of [-1, 1]) {
        const w = outline(M(new THREE.SphereGeometry(0.075 * size, 16, 12), mat, s * 0.085 * size, y, bodyZ(0, y) + 0.02), 1.1);
        w.scale.set(1.2, 0.8, 0.45);
        w.rotation.z = s * 0.2;
        g.add(w);
      }
      g.add(outline(M(new THREE.SphereGeometry(0.038 * size, 12, 10), knotMat, 0, y, bodyZ(0, y) + 0.035), 1.12));
    };
    if (kind === 'bowtie') {
      bow(-0.25, toon('#e8463a'), toon('#c3271a'));
    } else if (kind === 'necktie') {
      const sh = new THREE.Shape();
      sh.moveTo(-0.045, 0); sh.lineTo(0.045, 0); sh.lineTo(0.075, -0.3); sh.lineTo(0, -0.38); sh.lineTo(-0.075, -0.3); sh.lineTo(-0.045, 0);
      const oy = -0.28;
      const geo = hugBody(new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: false }), 0.006, oy);
      const tie = new THREE.Mesh(geo, toon('#3d6bff'));
      tie.position.y = oy;
      g.add(tie);
      const knot = outline(M(new THREE.SphereGeometry(0.05, 12, 10), toon('#2a4fd0'), 0, -0.265, bodyZ(0, -0.265) + 0.02), 1.1);
      knot.scale.set(1.1, 0.8, 0.5);
      g.add(knot);
      for (let i = 0; i < 3; i++) {
        const y = -0.37 - i * 0.08;
        g.add(M(new THREE.BoxGeometry(0.11, 0.014, 0.006), toon('#ffc22e'), 0, y, bodyZ(0, y) + 0.027));
      }
    } else if (kind === 'scarf') {
      const knit = toon('#ff8c42');
      const ring = outline(M(new THREE.TorusGeometry(0.47, 0.075, 12, 44), knit, 0, -0.2, 0), 1.03);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      for (let i = 0; i < 2; i++) {
        const x = 0.2 + i * 0.05, y = -0.39 - i * 0.04;
        const tail = outline(M(new THREE.BoxGeometry(0.13, 0.32, 0.05), knit, x, y, bodyZ(x, y) + 0.03 - i * 0.015), 1.06);
        tail.rotation.z = 0.12 + i * 0.1;
        g.add(tail);
        g.add(M(new THREE.BoxGeometry(0.135, 0.03, 0.055), toon('#fff4e0'), x + 0.012, y - 0.09, bodyZ(x, y - 0.09) + 0.03 - i * 0.015));
      }
    } else if (kind === 'chain') {
      const gold = toon('#f2b322');
      const links = 30;
      for (let i = 0; i < links; i++) {
        const a = Math.PI * (0.1 + 0.8 * (i / (links - 1)));
        const x = Math.cos(a) * 0.46, y = -0.17 - Math.sin(a) * 0.22;
        const l = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.009, 6, 12), gold);
        l.position.copy(onBody(x, y, 0.01));
        l.rotation.set(0, Math.atan2(x, bodyZ(x, y)), a);
        g.add(l);
      }
      const medal = outline(M(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 24), gold, 0, -0.47, bodyZ(0, -0.47) + 0.022), 1.08);
      medal.rotation.x = Math.PI / 2;
      g.add(medal);
      g.add(M(new THREE.OctahedronGeometry(0.035, 0), toon('#ff3b4e'), 0, -0.47, bodyZ(0, -0.47) + 0.045));
    } else if (kind === 'medal') {
      // Two ribbons come round from the sides of the neck and meet in a V at the medal
      g.add(strapOn([[-0.44, -0.08], [-0.3, -0.2], [-0.12, -0.36], [-0.03, -0.44]], 0.026, toon('#1d2a6b')));
      g.add(strapOn([[0.44, -0.08], [0.3, -0.2], [0.12, -0.36], [0.03, -0.44]], 0.026, toon('#e8463a')));
      const z = bodyZ(0, -0.52) + 0.03;
      const medal = outline(M(new THREE.CylinderGeometry(0.085, 0.085, 0.028, 26), toon('#f2b322'), 0, -0.52, z), 1.08);
      medal.rotation.x = Math.PI / 2;
      g.add(medal);
      const star = new THREE.Mesh(new THREE.ShapeGeometry(starShape(0.05, 0.022)), toon('#c98a0c'));
      star.position.set(0, -0.52, z + 0.016);
      g.add(star);
    } else if (kind === 'lei' || kind === 'pearls') {
      const pearls = kind === 'pearls';
      const cols = pearls ? ['#fff6ee', '#f3e8dc'] : ['#ff7aa2', '#ffd23f', '#ffffff', '#ff8c42'];
      const n = pearls ? 34 : 22, r = pearls ? 0.03 : 0.05;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const y = (pearls ? -0.2 : -0.22) - Math.max(0, Math.cos(a)) * (pearls ? 0.17 : 0.14);
        const rr = bodyR(y) + r * 0.6;
        g.add(M(new THREE.SphereGeometry(r, 10, 8), toon(cols[i % cols.length]), Math.sin(a) * rr, y, Math.cos(a) * rr));
      }
      if (pearls) g.add(outline(M(new THREE.SphereGeometry(0.045, 14, 10), toon('#ff7aa2'), 0, -0.39, bodyZ(0, -0.39) + 0.04), 1.1));
    } else if (kind === 'cape') {
      // Hangs from the shoulders (arm height) down past the feet line, wrapped around the back
      const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.515, 0.68, 1.02, 36, 1, true, Math.PI * 0.58, Math.PI * 0.84), toon('#d63c3c', { side: THREE.DoubleSide }));
      cape.position.set(0, -0.48, -0.01);
      g.add(cape);
      for (const s of [-1, 1]) {
        const clasp = outline(M(new THREE.SphereGeometry(0.05, 14, 10), toon('#f2b322'), s * 0.4, 0.07, 0.29), 1.12);
        clasp.scale.set(1, 1, 0.6);
        g.add(clasp);
      }
    } else if (kind === 'tuxedo') {
      // White shirt front with buttons and a black bow tie
      const sh = new THREE.Shape();
      sh.moveTo(-0.13, 0); sh.lineTo(0.13, 0); sh.lineTo(0.075, -0.42); sh.lineTo(0, -0.47); sh.lineTo(-0.075, -0.42); sh.lineTo(-0.13, 0);
      const oy = -0.22;
      const shirt = new THREE.Mesh(hugBody(new THREE.ShapeGeometry(sh, 8), 0.007, oy), toon('#f6f1e8'));
      shirt.position.y = oy;
      g.add(shirt);
      for (const y of [-0.4, -0.52]) g.add(M(new THREE.SphereGeometry(0.018, 8, 6), toon('#1d1b22'), 0, y, bodyZ(0, y) + 0.012));
      bow(-0.24, toon('#1d1b22'), toon('#1d1b22'), 0.85);
    } else if (kind === 'suspenders') {
      const strap = toon('#e8463a');
      for (const s of [-1, 1]) {
        g.add(strapOn([[s * 0.47, -0.06], [s * 0.36, -0.17], [s * 0.2, -0.27], [s * 0.2, -0.45], [s * 0.2, -0.62]], 0.026, strap));
        g.add(outline(M(new THREE.SphereGeometry(0.03, 10, 8), toon('#f2b322'), s * 0.2, -0.6, bodyZ(s * 0.2, -0.6) + 0.035), 1.12));
      }
    } else if (kind === 'guitar') {
      // A little acoustic guitar slung across the front
      const gtr = new THREE.Group();
      const wood = toon('#e0a050');
      const lower = outline(M(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 28), wood, 0, 0, 0), 1.05);
      lower.rotation.x = Math.PI / 2;
      const upper = outline(M(new THREE.CylinderGeometry(0.145, 0.145, 0.07, 28), wood, 0, 0.21, 0), 1.05);
      upper.rotation.x = Math.PI / 2;
      gtr.add(lower, upper);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), toon('#3a2418'));
      hole.position.set(0, 0.12, 0.037);
      gtr.add(hole);
      gtr.add(outline(M(new THREE.BoxGeometry(0.07, 0.5, 0.04), toon('#8a5a2b'), 0, 0.55, 0), 1.06));
      gtr.add(outline(M(new THREE.BoxGeometry(0.1, 0.12, 0.05), toon('#3a2418'), 0, 0.84, 0), 1.06));
      gtr.position.set(-0.06, -0.48, bodyZ(0, -0.48) + 0.05);
      gtr.rotation.z = -0.95;
      g.add(gtr);
      g.add(strapOn([[-0.46, -0.6], [-0.3, -0.42], [0, -0.26], [0.3, -0.16], [0.47, -0.08]], 0.02, toon('#3a2418')));
    } else if (kind === 'wings') {
      // Angel wings peeking out from behind
      const feather = toon('#f6f1e8');
      for (const s of [-1, 1]) {
        const wing = new THREE.Group();
        wing.position.set(s * 0.3, 0.05, -0.38);
        wing.rotation.set(0, -s * 0.55, s * 0.35);
        [[0, 0, 0.26], [0.22, -0.1, 0.22], [0.4, -0.24, 0.17]].forEach(([x, y, r]) => {
          const f = outline(M(new THREE.SphereGeometry(r, 18, 12), feather, s * x, y, 0), 1.04);
          f.scale.set(1, 0.62, 0.3);
          wing.add(f);
        });
        g.add(wing);
      }
    } else if (kind === 'backpack') {
      const blue = toon('#3d8bff');
      const pack = outline(M(new THREE.CapsuleGeometry(0.26, 0.22, 8, 16), blue, 0, -0.3, -0.5), 1.04);
      pack.scale.set(1.2, 1, 0.55);
      g.add(pack);
      g.add(outline(M(new THREE.BoxGeometry(0.3, 0.16, 0.08), toon('#2a5fd0'), 0, -0.42, -0.65), 1.06));
      for (const s of [-1, 1]) g.add(strapOn([[s * 0.5, -0.04], [s * 0.42, -0.12], [s * 0.24, -0.24], [s * 0.24, -0.4], [s * 0.4, -0.54]], 0.028, toon('#2a5fd0')));
    } else if (kind === 'hoodie') {
      // A hood resting behind the head, plus drawstrings down the front
      const cloth = toon('#5f6bd8', { side: THREE.DoubleSide });
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.57, 32, 16, Math.PI * 0.92, Math.PI * 1.16, Math.PI * 0.12, Math.PI * 0.72), cloth);
      hood.position.y = 0.2;
      g.add(hood);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.05, 10, 40, Math.PI * 1.1), toon('#4a55c0'));
      rim.position.set(0, 0.2, -0.05);
      rim.rotation.set(0, 0, -Math.PI * 0.05);
      g.add(rim);
      for (const s of [-1, 1]) {
        g.add(strapOn([[s * 0.14, -0.16], [s * 0.13, -0.3], [s * 0.14, -0.44]], 0.014, toon('#f6f1e8')));
        g.add(M(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 8), toon('#c8cbe0'), s * 0.14, -0.47, bodyZ(s * 0.14, -0.47) + 0.016));
      }
    } else if (kind === 'apron') {
      const sh = new THREE.Shape();
      const w = 0.27, top = 0, bot = -0.5, r = 0.07;
      sh.moveTo(-w + 0.04, top); sh.lineTo(w - 0.04, top); sh.lineTo(w, bot + r); sh.quadraticCurveTo(w, bot, w - r, bot); sh.lineTo(-w + r, bot); sh.quadraticCurveTo(-w, bot, -w, bot + r); sh.lineTo(-w + 0.04, top);
      const oy = -0.2;
      const apron = new THREE.Mesh(hugBody(new THREE.ShapeGeometry(sh, 12), 0.008, oy), toon('#f6f1e8'));
      apron.position.y = oy;
      g.add(apron);
      const psh = new THREE.Shape();
      psh.moveTo(-0.1, 0); psh.lineTo(0.1, 0); psh.lineTo(0.1, -0.1); psh.quadraticCurveTo(0, -0.14, -0.1, -0.1); psh.lineTo(-0.1, 0);
      const poy = -0.46;
      const pocket = new THREE.Mesh(hugBody(new THREE.ShapeGeometry(psh, 8), 0.014, poy), toon('#ff7aa2'));
      pocket.position.y = poy;
      g.add(pocket);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(bodyR(-0.33) + 0.008, 0.016, 6, 48), toon('#ff7aa2'));
      tie.rotation.x = Math.PI / 2;
      tie.position.y = -0.33;
      g.add(tie);
    } else if (kind === 'tutu') {
      // A ruffled pink skirt around the bottom of the body
      const tulle = [toon('#ff9ecf'), toon('#ffb8dc')];
      for (let layer = 0; layer < 2; layer++) {
        const y = -0.5 - layer * 0.08;
        const n = 18;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + layer * 0.17;
          const rr = bodyR(y) + 0.1 - layer * 0.02;
          const ruffle = outline(M(new THREE.SphereGeometry(0.11, 12, 8), tulle[(i + layer) % 2], Math.sin(a) * rr, y, Math.cos(a) * rr), 1.04);
          ruffle.scale.set(1, 0.42, 0.7);
          ruffle.rotation.y = a;
          g.add(ruffle);
        }
      }
    } else if (kind === 'emblem') {
      // A superhero chest emblem
      const oy = -0.38;
      const disc = new THREE.Mesh(hugBody(new THREE.CircleGeometry(0.15, 32), 0.008, oy), toon('#ffc22e'));
      disc.position.y = oy;
      g.add(disc);
      const ring = new THREE.Mesh(hugBody(new THREE.RingGeometry(0.15, 0.175, 32), 0.008, oy), toon('#c3271a'));
      ring.position.y = oy;
      g.add(ring);
      const star = new THREE.Mesh(hugBody(new THREE.ShapeGeometry(starShape(0.1, 0.045)), 0.014, oy), toon('#e8333a'));
      star.position.y = oy;
      g.add(star);
    } else if (kind === 'rose') {
      // A red rose pinned on the chest
      const red = toon('#d6253c');
      const x = -0.2, y = -0.3, z = bodyZ(x, y);
      const rose = new THREE.Group();
      rose.position.set(x, y, z + 0.02);
      rose.rotation.y = Math.atan2(x, z);
      for (let i = 0; i < 3; i++) {
        const petal = new THREE.Mesh(new THREE.TorusGeometry(0.03 + i * 0.022, 0.018, 8, 18), red);
        petal.position.z = 0.02 - i * 0.01;
        rose.add(petal);
      }
      rose.add(M(new THREE.SphereGeometry(0.028, 10, 8), toon('#a8122a'), 0, 0, 0.025));
      for (const s of [-1, 1]) {
        const leaf = M(new THREE.SphereGeometry(0.05, 10, 8), toon('#3fbf5c'), s * 0.07, -0.08, -0.005);
        leaf.scale.set(1, 0.45, 0.3);
        leaf.rotation.z = s * 0.6;
        rose.add(leaf);
      }
      g.add(rose);
    }
    return g;
  }

  /*
   * Expressions: the resting face a player picks. brow is [height, tilt] (tilt > 0 lifts the inner
   * ends = worried; < 0 drops them = cross), either one pair for both brows or [left, right].
   * lid squints or widens each eye. Game moments (a sad score, a flinch, singing) take over briefly.
   */
  const EXPRS = {
    smile: { brow: [0.37, -0.04], lid: [1, 1], mouth: 'smile' },
    grin: { brow: [0.39, -0.12], lid: [0.8, 0.8], mouth: 'grin' },
    sad: { brow: [0.36, 0.38], lid: [0.92, 0.92], mouth: 'frown' },
    angry: { brow: [0.33, -0.45], lid: [0.82, 0.82], mouth: 'flat' },
    smug: { brow: [[0.35, -0.08], [0.43, 0.16]], lid: [0.62, 0.62], mouth: 'smirk' },
    shocked: { brow: [0.45, 0.12], lid: [1.18, 1.18], mouth: 'o' },
    sleepy: { brow: [0.35, 0.1], lid: [0.4, 0.4], mouth: 'flat' },
    wink: { brow: [[0.39, -0.06], [0.36, -0.06]], lid: [1, 0], mouth: 'grin' },
    love: { brow: [0.4, 0.14], lid: [1, 1], mouth: 'smile', pupils: 'heart' },
    starry: { brow: [0.41, -0.04], lid: [1.05, 1.05], mouth: 'grin', pupils: 'star' },
    cool: { brow: [0.35, -0.18], lid: [0.68, 0.68], mouth: 'smirk' },
    goofy: { brow: [[0.42, 0.12], [0.35, -0.16]], lid: [1.12, 0.86], mouth: 'tongue' },
    laughing: { brow: [0.41, 0.1], lid: [0, 0], mouth: 'grin' },
    shy: { brow: [0.37, 0.26], lid: [0.55, 0.55], mouth: 'smile', blush: 1.7 },
    teary: { brow: [0.37, 0.4], lid: [0.85, 0.85], mouth: 'frown', tears: true },
    evil: { brow: [0.33, -0.48], lid: [0.62, 0.62], mouth: 'grin' },
    dizzy: { brow: [[0.41, 0.15], [0.36, -0.1]], lid: [1, 1], mouth: 'wobble', pupils: 'spiral' },
    angelic: { brow: [0.4, 0.12], lid: [0, 0], mouth: 'smile', blush: 1.3 },
    nervous: { brow: [0.39, 0.34], lid: [1.08, 1.08], mouth: 'wobble', sweat: true },
    kissy: { brow: [0.39, 0.06], lid: [0.55, 0.55], mouth: 'kiss', blush: 1.45 },
  };
  const starShape = (r1, r2) => {
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? r2 : r1;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return sh;
  };

  const EYE = new THREE.MeshBasicMaterial({ color: '#f6f2ec' });
  const PUPIL = new THREE.MeshBasicMaterial({ color: '#16121c' });
  const MOUTH = new THREE.MeshBasicMaterial({ color: '#3a0f18' });
  const BROW = toon('#1e1820');
  const MOODS = {
    happy: { y: 0.37, inner: -0.04 },
    sing: { y: 0.395, inner: 0.16 },
    sad: { y: 0.36, inner: 0.38 },
    shock: { y: 0.42, inner: 0.1 },
  };
  const cardCache = {};
  function cardTex(n) {
    if (cardCache[n]) return cardCache[n];
    const colors = ['#e8463a', '#ef7f37', '#d79a00', '#47a836', '#0fa676'];
    return (cardCache[n] = canvasTex(256, 200, (c, w, h) => {
      c.fillStyle = '#fff6e8';
      c.beginPath(); c.roundRect(6, 6, w - 12, h - 12, 28); c.fill();
      c.lineWidth = 10; c.strokeStyle = '#1a0f14'; c.stroke();
      c.font = '150px "Lilita One"';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = colors[n - 1];
      c.fillText(String(n), w / 2, h / 2 + 10);
    }));
  }
  const _v = new THREE.Vector3();
  const _h = new THREE.Vector3();

  class Character {
    constructor(look, index) {
      this.root = new THREE.Group();
      this.body = new THREE.Group();
      this.root.add(this.body);
      this.look = { ...look };
      this.mat = toon(look.color);
      this.footMat = toon(new THREE.Color(look.color).multiplyScalar(0.62));
      this.torso = outline(M(new THREE.CapsuleGeometry(0.5, 0.62, 10, 28), this.mat, 0, 0.89, 0), 1.035);
      this.body.add(this.torso);
      this.face = new THREE.Group();
      this.torso.add(this.face);
      this.eyes = []; this.pupils = []; this.brows = [];
      for (const s of [-1, 1]) {
        const eye = new THREE.Group();
        eye.position.set(s * 0.17, 0.2, 0.43);
        const white = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), EYE);
        white.scale.set(1, 1.12, 0.55);
        eye.add(white);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.066, 16, 12), PUPIL);
        pupil.position.set(0, -0.01, 0.06);
        pupil.scale.set(1, 1.1, 0.5);
        eye.add(pupil);
        // Heart and star pupils for the "in love" and "starstruck" faces
        const hp = new THREE.Mesh(new THREE.ShapeGeometry(heart(0.42), 12), new THREE.MeshBasicMaterial({ color: '#ff3d7f' }));
        hp.position.set(0, -0.005, 0.075);
        hp.visible = false;
        eye.add(hp);
        const sp = new THREE.Mesh(new THREE.ShapeGeometry(starShape(0.075, 0.034)), new THREE.MeshBasicMaterial({ color: '#f2b322' }));
        sp.position.set(0, -0.005, 0.075);
        sp.visible = false;
        eye.add(sp);
        // Spiral pupils for the dizzy face
        const spiralPts = [];
        for (let k = 0; k <= 60; k++) { const t = k / 60, a = t * Math.PI * 4.5, r = 0.008 + t * 0.06; spiralPts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
        const spiral = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiralPts), 80, 0.009, 5), PUPIL);
        spiral.position.set(0, -0.005, 0.072);
        spiral.visible = false;
        eye.add(spiral);
        eye.userData.special = { heart: hp, star: sp, spiral };
        // A real eyelid: a skin-colored shell around the eye that rolls down over it (instead of
        // squashing the whole eye flat). Its pivot is the eye's center; shut = rotation.x of +90°.
        const lidPivot = new THREE.Group();
        lidPivot.scale.set(1.07, 1.18, 0.74);
        const lid = new THREE.Mesh(new THREE.SphereGeometry(0.13, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.lidMat || (this.lidMat = toon(new THREE.Color(look.color).multiplyScalar(0.93))));
        lid.rotation.x = -Math.PI / 2;
        lidPivot.add(lid);
        eye.add(lidPivot);
        // A shut eye reads as a soft curve, like a content smile
        const shut = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.017, 8, 20, Math.PI), PUPIL);
        shut.rotation.z = Math.PI;
        shut.position.set(0, 0.01, 0.112);
        shut.visible = false;
        eye.add(shut);
        eye.userData.lid = lid;
        eye.userData.shut = shut;
        this.face.add(eye);
        this.eyes.push(eye); this.pupils.push(pupil);
        const brow = new THREE.Group();
        brow.position.set(s * 0.17, 0.37, 0.44);
        const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.11, 4, 8), BROW);
        b.rotation.z = Math.PI / 2;
        brow.add(b);
        brow.userData.side = s;
        this.face.add(brow);
        this.brows.push(brow);
      }
      const cheekMat = toon('#ff8fa3', { transparent: true, opacity: 0.5 });
      this.cheeks = [];
      this.tears = [];
      for (const s of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), cheekMat);
        c.scale.set(1, 0.6, 0.25);
        c.position.set(s * 0.3, 0.02, 0.405);
        c.rotation.y = s * 0.64;
        this.face.add(c);
        this.cheeks.push(c);
        // Teardrops for the teary face
        const tear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), new THREE.MeshBasicMaterial({ color: '#7fd6ff' }));
        tear.scale.set(0.8, 1.25, 0.5);
        tear.position.set(s * 0.25, 0.07, 0.43);
        tear.visible = false;
        this.face.add(tear);
        this.tears.push(tear);
      }
      // A nervous sweat drop at the side of the forehead
      this.sweat = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshBasicMaterial({ color: '#8fdcff' }));
      this.sweat.scale.set(0.75, 1.3, 0.5);
      this.sweat.position.set(0.34, 0.36, 0.37);
      this.sweat.visible = false;
      this.face.add(this.sweat);
      this.mouthOpen = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 12), MOUTH);
      this.mouthOpen.position.set(0, -0.08, 0.47);
      this.face.add(this.mouthOpen);
      this.smile = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 20, Math.PI), PUPIL);
      this.smile.position.set(0, -0.05, 0.488);
      this.smile.rotation.z = Math.PI;
      this.face.add(this.smile);
      this.frown = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.017, 8, 20, Math.PI), PUPIL);
      this.frown.position.set(0, -0.12, 0.488);
      this.face.add(this.frown);
      // More mouths for the expressions
      // An open D-shaped grin, bent onto the curve of the face so it never sinks into it
      const grin = new THREE.Group();
      grin.add(new THREE.Mesh(hugFace(new THREE.CircleGeometry(0.11, 24, Math.PI, Math.PI), 0.01), MOUTH));
      const tg = new THREE.CircleGeometry(0.05, 16);
      tg.scale(1.25, 0.6, 1);
      tg.translate(0, -0.07, 0);
      grin.add(new THREE.Mesh(hugFace(tg, 0.013), new THREE.MeshBasicMaterial({ color: '#ff6f8a' })));
      grin.position.set(0, -0.03, 0.5);
      const flat = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.085, 4, 8), PUPIL);
      flat.rotation.z = Math.PI / 2;
      flat.position.set(0, -0.075, 0.49);
      const smirk = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.017, 8, 20, Math.PI * 0.75), PUPIL);
      smirk.position.set(0.03, -0.05, 0.488);
      smirk.rotation.z = Math.PI * 1.12;
      const goofy = new THREE.Group();
      goofy.add(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 20, Math.PI), PUPIL));
      goofy.children[0].rotation.z = Math.PI;
      const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.06, 4, 10), new THREE.MeshBasicMaterial({ color: '#ff6f8a' }));
      tip.scale.z = 0.5;
      tip.position.set(0.035, -0.1, 0.02);
      tip.rotation.z = 0.25;
      goofy.add(tip);
      goofy.position.set(0, -0.05, 0.492);
      const wobblePts = [];
      for (let k = 0; k <= 8; k++) wobblePts.push(new THREE.Vector3(-0.085 + k * 0.021, (k % 2 ? 0.012 : -0.012), 0));
      const wobble = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wobblePts), 40, 0.013, 6), PUPIL);
      wobble.position.set(0, -0.075, 0.493);
      const kiss = new THREE.Group();
      const lips = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.019, 10, 20), new THREE.MeshBasicMaterial({ color: '#c2335a' }));
      lips.scale.set(1, 1.15, 0.6);
      kiss.add(lips);
      kiss.position.set(0.02, -0.07, 0.5);
      this.mouths = { grin, flat, smirk, tongue: goofy, wobble, kiss };
      for (const m of Object.values(this.mouths)) { m.visible = false; this.face.add(m); }
      this.arms = [-1, 1].map((s) => {
        const sh = new THREE.Group();
        sh.position.set(s * 0.47, -0.02, 0);
        sh.add(outline(M(new THREE.CapsuleGeometry(0.09, 0.26, 6, 12), this.mat, 0, -0.2, 0), 1.08));
        sh.rotation.z = s * 0.28;
        this.torso.add(sh);
        return sh;
      });
      this.feet = [-1, 1].map((s) => {
        const f = outline(M(new THREE.CapsuleGeometry(0.11, 0.12, 6, 12), this.footMat, s * 0.2, 0.1, 0.05), 1.07);
        f.rotation.x = Math.PI / 2;
        this.body.add(f);
        return f;
      });
      this.hat = accessory(look.hat, look.hatColor);
      this.torso.add(this.hat);
      this.extra = faceExtra(look.face, this.eyes);
      this.face.add(this.extra);
      this.outfit = outfit(look.outfit);
      this.torso.add(this.outfit);
      this.card = new THREE.Group();
      this.card.add(M(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 8), toon('#b8944e'), 0, -0.35, 0));
      this.cardFace = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.48), new THREE.MeshBasicMaterial({ transparent: true }));
      this.cardFace.position.y = 0.2;
      this.card.add(this.cardFace);
      this.card.position.set(0.32, 1.0, 0.15);
      this.card.scale.setScalar(0.001);
      this.root.add(this.card);
      this.cardUp = 0; this.cardT = 0;
      this.yaw = 0; this.baseY = 0;
      this.s = 0; this.sv = 0; this.visTarget = 0;
      this.squash = 0; this.squashV = 0;
      this.jumpT = 0; this.jumps = 0; this.jumpY = 0;
      this.flinch = 0; this.talk = 0; this.talkTarget = 0;
      this.mood = 'happy';
      this.singing = false;
      this.phase = index * 1.7;
      this.blinkT = rand(1, 4); this.blinking = 0;
      this.pending = null;
      scene.add(this.root);
    }
    setLook(look) {
      if (look.color !== this.look.color) { this.mat.color.set(look.color); this.footMat.color.set(look.color).multiplyScalar(0.62); this.lidMat.color.set(look.color).multiplyScalar(0.93); }
      if (look.hat !== this.look.hat || look.hatColor !== this.look.hatColor) { this.torso.remove(this.hat); this.hat = accessory(look.hat, look.hatColor); this.torso.add(this.hat); }
      if (look.face !== this.look.face) { this.face.remove(this.extra); dropExtra(this.extra); this.extra = faceExtra(look.face, this.eyes); this.face.add(this.extra); }
      if (look.outfit !== this.look.outfit) { this.torso.remove(this.outfit); this.outfit = outfit(look.outfit); this.torso.add(this.outfit); }
      this.look = { ...look };
    }
    set(x, y, z, yaw = 0) { this.root.position.set(x, y, z); this.baseY = y; this.yaw = yaw; this.root.rotation.y = yaw; this.visTarget = 1; }
    moveTo(x, y, z, yaw = 0) {
      const p = this.root.position;
      if (this.s > 0.05 && Math.hypot(p.x - x, p.z - z) < 0.05 && Math.abs(this.baseY - y) < 0.05) { this.yaw = yaw; this.visTarget = 1; this.pending = null; return; }
      if (this.s < 0.05) { this.pending = null; this.set(x, y, z, yaw); puff(this.root.position); return; }
      this.pending = { x, y, z, yaw };
      this.visTarget = 0;
    }
    hide() { this.visTarget = 0; this.pending = null; }
    jump(n = 1) { this.jumps = n; this.jumpT = 0.48; this.squashV += 3; }
    hit() { this.flinch = 1; this.squashV -= 5; }
    /** Hold (or put away) the squeaky hammer. */
    holdHammer(on) {
      if (on && !this.hammer) { this.hammer = toyHammer(); this.root.add(this.hammer); }
      if (!on && this.hammer) { this.root.remove(this.hammer); this.hammer = null; }
    }
    /** Knocked silly for a few seconds: squashed flat, stars circling the head. */
    daze(sec) {
      this.flinch = 1;
      this.squashV -= 16;
      this.dazed = sec;
      if (!this.stars) { this.stars = dizzyStars(); this.root.add(this.stars); }
    }
    raiseCard(n) { this.cardFace.material.map = cardTex(n); this.cardFace.material.needsUpdate = true; this.cardUp = 1; this.cardT = 0; this.squashV += 2; }
    lowerCard() { this.cardUp = 0; }
    dispose() { scene.remove(this.root); }
    update(dt, t, beat) {
      const pos = this.root.position;
      if (this.pending && this.s < 0.04) { const q = this.pending; this.pending = null; puff(pos); this.set(q.x, q.y, q.z, q.yaw); puff(this.root.position); }
      if (this.jumpT > 0) {
        this.jumpT -= dt;
        const p = clamp(1 - this.jumpT / 0.48, 0, 1);
        this.jumpY = Math.sin(Math.PI * p) * 0.45;
        if (this.jumpT <= 0) { this.jumpY = 0; this.squashV -= 4; if (--this.jumps > 0) this.jumpT = 0.48; }
      }
      pos.y = this.baseY + this.jumpY;
      this.root.rotation.y = damp(this.root.rotation.y, this.yaw + (this.singing ? Math.sin(beat * Math.PI / 4) * 0.2 : 0), 6, dt);
      this.sv += (this.visTarget - this.s) * 150 * dt;
      this.sv *= Math.exp(-12 * dt);
      this.s += this.sv * dt;
      this.root.scale.setScalar(Math.max(0.0001, this.s));
      this.root.visible = this.s > 0.01 || this.visTarget > 0;
      this.squashV += -this.squash * 170 * dt;
      this.squashV *= Math.exp(-8 * dt);
      this.squash += this.squashV * dt;
      this.flinch = damp(this.flinch, 0, 3, dt);
      this.talk = damp(this.talk, this.talkTarget, 22, dt);

      const breath = Math.sin(t * 2.2 + this.phase) * 0.012;
      const groove = this.singing ? Math.abs(Math.sin(beat * Math.PI)) : 0;
      const st = this.squash * 0.12;
      this.body.scale.set(1 - st * 0.5, 1 + st + breath + groove * 0.025, 1 - st * 0.5);
      this.body.position.y = groove * 0.05;
      this.body.rotation.z = this.singing ? Math.sin(beat * Math.PI * 0.5) * 0.06 : Math.sin(t * 0.9 + this.phase) * 0.02;
      this.torso.rotation.x = -this.flinch * 0.4 + (this.mood === 'sad' ? 0.15 : 0);
      const cheer = this.jumpT > 0 ? 1 : 0;
      this.arms.forEach((a, i) => {
        const side = i === 0 ? -1 : 1;
        const sing = this.singing ? Math.abs(Math.sin(beat * Math.PI + i)) * 0.3 : 0;
        const holding = (this.cardUp || this.hammer) && i === 1 ? (this.hammer ? 1.2 : 2.5) : 0;
        a.rotation.z = damp(a.rotation.z, side * (0.28 + cheer * 2.2 + sing + holding), 12, dt);
      });
      this.hat.traverse((o) => {
        if (o.userData.spin) o.rotation.y += dt * (6 + this.talk * 14);
        if (o.userData.bob) o.position.y = 0.81 + 0.2 + Math.sin(t * 2.4 + this.phase) * 0.025;
      });
      this.blinkT -= dt;
      if (this.blinkT < 0) { this.blinking = 0.12; this.blinkT = rand(2, 5); }
      this.blinking -= dt;
      const mood = this.flinch > 0.35 ? 'shock' : this.talk > 0.15 && this.singing ? 'sing' : this.mood;
      // The resting face is the player's chosen expression; a sad score or a flinch takes over for a moment
      const ex = mood === 'sad' ? EXPRS.sad : EXPRS[this.look.mood] || EXPRS.smile;
      const browOf = (i) => (mood === 'shock' ? [0.42, 0.1] : mood === 'sing' ? [0.395, 0.16] : Array.isArray(ex.brow[0]) ? ex.brow[i] : ex.brow);
      _v.copy(camera.position);
      this.face.worldToLocal(_v);
      _v.normalize();
      const special = mood === 'shock' ? null : ex.pupils;
      this.eyes.forEach((e, i) => {
        const lid = this.blinking > 0 ? 0 : mood === 'shock' ? 1.12 : mood === 'sing' ? Math.max(0.8, ex.lid[i]) : ex.lid[i];
        // Below 1 the eyelid comes down (0 = shut); above 1 the eye opens wider
        const close = clamp(1 - lid, 0, 1);
        e.userData.close = damp(e.userData.close ?? close, close, 30, dt);
        // Eased so half-lidded looks lazy rather than swollen, and 1 still shuts all the way
        e.userData.lid.rotation.x = (Math.pow(e.userData.close, 1.3) - 0.5) * Math.PI;
        e.userData.shut.visible = e.userData.close > 0.88;
        e.scale.y = damp(e.scale.y, Math.max(1, lid), 30, dt);
        const px = clamp(_v.x, -1, 1) * 0.035, py = -0.01 + clamp(_v.y, -1, 1) * 0.025;
        this.pupils[i].position.x = px;
        this.pupils[i].position.y = py;
        this.pupils[i].visible = !special;
        for (const [k, m] of Object.entries(e.userData.special)) { m.visible = special === k; m.position.x = px; m.position.y = py; }
      });
      this.brows.forEach((b, i) => {
        const [y, inner] = browOf(i);
        b.position.y = damp(b.position.y, y, 14, dt);
        b.rotation.z = damp(b.rotation.z, inner * -b.userData.side, 14, dt);
      });
      const blush = mood === 'shock' ? 1 : ex.blush || 1;
      this.cheeks.forEach((c) => c.scale.set(blush, 0.6 * blush, 0.25));
      this.sweat.visible = !!ex.sweat && mood !== 'shock';
      this.tears.forEach((t, i) => { t.visible = !!ex.tears && mood !== 'shock'; if (t.visible) t.position.y = 0.07 - ((performance.now() / 1000 + i * 0.45) % 0.9) * 0.12; });
      const open = Math.max(this.talk, this.flinch > 0.3 ? this.flinch : 0);
      const talking = open > 0.06;
      const shape = talking ? null : mood === 'shock' ? 'o' : ex.mouth;
      this.mouthOpen.visible = talking || shape === 'o';
      if (talking) this.mouthOpen.scale.set(1.25 - open * 0.25, 0.2 + open * 1.25, 0.5);
      else if (shape === 'o') this.mouthOpen.scale.set(0.6, 0.72, 0.5);
      this.smile.visible = shape === 'smile';
      this.frown.visible = shape === 'frown';
      for (const [k, m] of Object.entries(this.mouths)) m.visible = shape === k;
      this.cardT += dt;
      const up = this.cardUp ? easeOut(clamp(this.cardT / 0.35, 0, 1)) : 0;
      this.card.scale.setScalar(damp(this.card.scale.x, this.cardUp ? 1 : 0.001, this.cardUp ? 14 : 10, dt));
      this.card.position.y = 1.0 + up * 1.25;
      if (this.hammer) this.hammer.rotation.x = this.hammerAngle || 0;
      if (this.stars) {
        this.dazed -= dt;
        this.stars.children.forEach((s, i) => {
          const a = s.userData.a + t * 4.2;
          s.position.set(Math.cos(a) * 0.36, Math.sin(t * 6 + i) * 0.04, Math.sin(a) * 0.36);
          s.rotation.y = -a;
        });
        if (this.dazed <= 0) { this.root.remove(this.stars); this.stars = null; }
      }
    }
  }

  const chars = new Map();
  let charCount = 0;
  const ray = new THREE.Raycaster();

  // Portraits render on layer 1, far from the stage, with their own studio lights
  const portraits = new Map();
  const portraitCam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  portraitCam.layers.set(1);
  const portraitRT = new THREE.WebGLRenderTarget(256, 256, { samples: 4 });
  portraitRT.texture.colorSpace = THREE.SRGBColorSpace;
  const portraitBuf = new Uint8Array(256 * 256 * 4);
  const portraitCanvas = document.createElement('canvas');
  portraitCanvas.width = portraitCanvas.height = 256;
  const portraitCtx = portraitCanvas.getContext('2d');
  {
    const studio = [new THREE.HemisphereLight('#fff4e6', '#3a2a40', 2.2), new THREE.DirectionalLight('#ffffff', 1.6)];
    studio[1].position.set(203, 5, 205);
    studio[1].target.position.set(200, 1.2, 200);
    for (const l of studio) { l.layers.set(1); scene.add(l); }
    scene.add(studio[1].target);
  }

  /* ---------- Effects ---------- */
  const puffs = [];
  function puff(at) {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rand(0.08, 0.16), 10, 8), new THREE.MeshBasicMaterial({ color: '#f3ece4', transparent: true }));
      const a = (i / 9) * Math.PI * 2;
      s.userData.v = new THREE.Vector3(Math.cos(a) * rand(0.8, 1.4), rand(0.6, 1.6), Math.sin(a) * rand(0.8, 1.4));
      s.position.set(0, 0.6, 0);
      g.add(s);
    }
    g.position.copy(at);
    g.userData.t = 0;
    scene.add(g);
    puffs.push(g);
  }
  const splatMat = toon('#c8261a');
  const splats = [];
  function blob(r) {
    const g = new THREE.CircleGeometry(r, 26);
    const p = g.attributes.position;
    for (let i = 1; i < p.count; i++) { const k = rand(0.72, 1.28); p.setXY(i, p.getX(i) * k, p.getY(i) * k); }
    g.rotateX(-Math.PI / 2);
    return g;
  }
  function addSplat(x, z) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(blob(rand(0.16, 0.24)), splatMat));
    for (let i = 0; i < 4; i++) {
      const a = rand(0, Math.PI * 2), d = rand(0.25, 0.45);
      const drop = new THREE.Mesh(blob(rand(0.025, 0.05)), splatMat);
      drop.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      g.add(drop);
    }
    g.position.set(x, STAGE_TOP + 0.004 + splats.length * 0.0003, z);
    g.scale.setScalar(0.01);
    g.userData.t = 0;
    scene.add(g);
    splats.push(g);
    if (splats.length > 20) scene.remove(splats.shift());
  }
  const CONF = 240;
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.13), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONF);
  const conf = [];
  for (let i = 0; i < CONF; i++) {
    confetti.setColorAt(i, new THREE.Color(pick(['#ff4d3d', '#ffc22e', '#25d39b', '#3d8bff', '#ff7aa2', '#fff6e8'])));
    conf.push({ p: new THREE.Vector3(0, -9, 0), v: new THREE.Vector3(), r: new THREE.Euler(), rv: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)) });
  }
  confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  confetti.visible = false;
  scene.add(confetti);
  let confettiT = 0;
  const podium = new THREE.Group();
  const PODIUM = [[0, 0.62], [-1.35, 0.42], [1.35, 0.26]];
  PODIUM.forEach(([x, h], i) => {
    podium.add(outline(M(new THREE.BoxGeometry(1.15, h, 1.0), toon(['#f2b322', '#c3c9de', '#d18e55'][i]), x, h / 2, 0), 1.015));
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.36), new THREE.MeshBasicMaterial({ transparent: true }));
    num.position.set(x, h / 2, 0.51);
    num.userData.n = i + 1;
    podium.add(num);
  });
  podium.position.set(0, STAGE_TOP, -2.9);
  podium.visible = false;
  scene.add(podium);

  function paintDecor() {
    const P = [
      { bg: '#2b1446', title: 'KARAOKE', sub: 'NIGHT', accent: '#ff4d3d', foot: 'EVERY FRIDAY · 9PM' },
      { bg: '#0f3a4a', title: 'OPEN', sub: 'MIC', accent: '#ffc22e', foot: 'SIGN UP AT THE BAR' },
      { bg: '#4a1a1a', title: 'NO', sub: 'TALENT', accent: '#25d39b', foot: 'NO PROBLEM' },
    ];
    posterMats.forEach(({ mat, w, h }, i) => {
      const d = P[i % P.length];
      mat.map = canvasTex(Math.round(w * 300), Math.round(h * 300), (c, W, H) => {
        c.fillStyle = d.bg; c.fillRect(0, 0, W, H);
        c.fillStyle = d.accent; c.globalAlpha = 0.18;
        for (let r = 0; r < 12; r++) { c.beginPath(); c.arc(W / 2, H * 0.62, W * 0.12 + r * W * 0.07, 0, Math.PI * 2); c.lineWidth = W * 0.02; c.strokeStyle = d.accent; c.stroke(); }
        c.globalAlpha = 1;
        c.fillStyle = '#fff6e8'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `${Math.round(W * 0.24)}px "Lilita One"`;
        c.fillText(d.title, W / 2, H * 0.2);
        c.fillStyle = d.accent;
        c.font = `${Math.round(W * 0.3)}px "Lilita One"`;
        c.fillText(d.sub, W / 2, H * 0.4);
        c.beginPath(); c.arc(W / 2, H * 0.66, W * 0.14, 0, Math.PI * 2); c.fillStyle = '#fff6e8'; c.fill();
        c.fillRect(W / 2 - W * 0.025, H * 0.66, W * 0.05, H * 0.18);
        c.fillStyle = 'rgba(255,246,232,0.8)';
        c.font = `${Math.round(W * 0.07)}px "Lilita One"`;
        c.fillText(d.foot, W / 2, H * 0.92);
        c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = W * 0.03; c.strokeRect(0, 0, W, H);
      });
      mat.needsUpdate = true;
    });
    if (api_kitHead) {
      api_kitHead.material.map = canvasTex(256, 256, (c) => {
        c.fillStyle = '#f3ece4'; c.beginPath(); c.arc(128, 128, 128, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#c8331f'; c.font = '62px "Lilita One"'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('OFF', 128, 100); c.fillText('KEY', 128, 160);
      });
      api_kitHead.material.needsUpdate = true;
    }
    if (api_keyTop) {
      api_keyTop.material.map = canvasTex(512, 96, (c, W, H) => {
        c.fillStyle = '#f6f2ea'; c.fillRect(0, 0, W, H);
        const n = 24, kw = W / n;
        c.strokeStyle = '#9a948c'; c.lineWidth = 2;
        for (let i = 1; i < n; i++) { c.beginPath(); c.moveTo(i * kw, 0); c.lineTo(i * kw, H); c.stroke(); }
        c.fillStyle = '#16121c';
        for (let i = 0; i < n - 1; i++) if (![2, 6, 9, 13, 16, 20].includes(i % 21) && i % 7 !== 2 && i % 7 !== 6) c.fillRect((i + 1) * kw - kw * 0.3, 0, kw * 0.6, H * 0.6);
      });
      api_keyTop.material.needsUpdate = true;
    }
    rugMat.map = canvasTex(512, 512, (c, W) => {
      const rings = ['#7a2236', '#a8344a', '#e0a63c', '#a8344a', '#7a2236', '#5a1828'];
      rings.forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(W / 2, W / 2, W / 2 - i * 38, 0, Math.PI * 2); c.fill(); });
      c.strokeStyle = 'rgba(255,220,160,0.35)'; c.lineWidth = 6; c.setLineDash([14, 12]);
      c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 18, 0, Math.PI * 2); c.stroke();
    });
    rugMat.needsUpdate = true;
  }

  function paintText() {
    neonSign.material.map = neonTex('OFF KEY', '#ff3b2f', '140px "Lilita One"');
    neonSign.material.opacity = 1;
    neonSign.material.needsUpdate = true;
    sideSign.material.map = neonTex('NO REFUNDS', '#28e0a8', '110px "Lilita One"');
    sideSign.material.opacity = 1;
    sideSign.material.needsUpdate = true;
    podium.children.filter((c) => c.userData.n).forEach((num) => {
      num.material.map = canvasTex(128, 96, (c) => { c.font = '80px "Lilita One"'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#1a0f14'; c.fillText(String(num.userData.n), 64, 54); });
      num.material.needsUpdate = true;
    });
    Object.keys(cardCache).forEach((k) => delete cardCache[k]);
    paintDecor();
  }

  /* =====================================================================
     Layouts and camera
     ===================================================================== */
  let layout = 'menu';
  let lobbyWidth = 5;
  let shotName = 'menu';
  let lastCut = '';
  let focusSinger = null;
  let lightLevel = 1;
  let lightTarget = 1;
  let focus = false;
  let shake = 0;
  /*
   * Squeaky Hammer: the attacker pops up on stage beside the singer, winds up, bonks them on the
   * head at `hit` seconds, then pops back to their seat. Every screen runs the same timeline from
   * the server's start time, so the bonk lands at the same moment for everyone.
   */
  const bonks = [];
  const HAMMER_FROM = 0.5;
  function stepBonk(b) {
    // Real time, not frame time: the hit lands on schedule even if this tab stutters
    b.t = performance.now() / 1000 - b.start;
    const a = chars.get(b.by), tg = chars.get(b.target);
    if (!a || !tg) return true;
    if (b.t >= 0 && !b.home) {
      b.home = { x: a.root.position.x, y: a.baseY, z: a.root.position.z, yaw: a.yaw };
      const p = tg.root.position;
      // Stand to the singer's left (between the TV and the singer), a step upstage, turned toward
      // them and three-quarters to the camera so the swing reads clearly
      const dx = 1.3, dz = 0.35;
      a.moveTo(p.x - dx, tg.baseY, p.z - dz, Math.atan2(dx, dz));
    }
    if (b.t >= HAMMER_FROM && !b.armed) { b.armed = true; a.holdHammer(true); }
    if (b.armed && !b.done) {
      const k = b.t;
      const ease = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
      a.hammerAngle = k < b.hit - 0.18 ? -0.85 * ease((k - HAMMER_FROM) / (b.hit - 0.18 - HAMMER_FROM))
        : k < b.hit ? -0.85 + 2.1 * Math.pow(clamp((k - (b.hit - 0.18)) / 0.18, 0, 1), 2)
        : 1.25 - 0.9 * ease((k - b.hit - 0.15) / 0.5);
    }
    if (b.t >= b.hit && !b.landed) {
      b.landed = true;
      tg.daze(b.daze);
      shake = Math.max(shake, 0.4);
      puff(tg.root.position.clone().add(_v.set(-0.35, 1.5, 0.1)));
    }
    if (b.t >= b.hit + 0.9 && !b.done) {
      b.done = true;
      a.holdHammer(false);
      a.hammerAngle = 0;
      a.moveTo(b.home.x, b.home.y, b.home.z, b.home.yaw);
      return true;
    }
    return false;
  }
  let beatClock = 0;
  let simT = 0;
  const cam = { pos: new THREE.Vector3(0.75, 1.75, 2.9), look: new THREE.Vector3(0.75, 1.72, -2.75), fov: 40 };

  function fitDist(width, fov, frac) {
    return (width / frac) / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * camera.aspect);
  }
  let override = null;
  let viewShift = 0;
  /** A tall, narrow screen (a phone held upright): the UI stacks, so the stage is framed for the gaps. */
  const isPhone = () => innerWidth / innerHeight < 0.8 || innerWidth <= 640;
  /**
   * Phone framing: aim (almost level) at height `y` on the stage from `dist` away, then slide the
   * picture so that point lands `f` of the way down the screen. Sliding the projection instead of
   * tilting the camera keeps the stage upright and the characters clear of the lighting rig.
   */
  function phoneFrame(x, z, dist, f, camY, y = 1.55, fov = 40) {
    return { pos: [x, camY, z + dist], look: [x, y, z], fov, shift: 0.5 - f };
  }
  function phoneShot() {
    switch (shotName) {
      // Character in the middle, between the logo and the buttons; higher up when the wardrobe is open
      case 'menu': {
        // Fit the character into the free band between the logo and the name card (or the wardrobe sheet)
        const H = innerHeight;
        const sheet = document.body.classList.contains('dressing') && document.getElementById('lookBar')?.getBoundingClientRect().top;
        const card = document.getElementById('playerCard')?.getBoundingClientRect();
        const top = sheet ? 64 : 12 + 0.59 * Math.min(176, 0.44 * innerWidth, 0.21 * H);
        const bottom = sheet || (card?.height ? card.top + 8 : H * 0.62);
        const px = clamp((bottom - top) * 0.84, 120, 360);
        const dist = (2.3 * H / px) / (2 * Math.tan(THREE.MathUtils.degToRad(20)));
        return phoneFrame(-0.72, -2.75, dist, ((top + bottom) / 2 + px * 0.03) / H, 1.6, 1.62);
      }
      case 'lobby': {
        // The whole line-up across the top third of the screen
        // A wider lens than on desktop, so the camera can stay close (behind it are props that would block the view)
        const fov = 64;
        const d = clamp((lobbyWidth / 0.9) / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * camera.aspect), 5.5, 17);
        return { ...phoneFrame(0, -2.95, d, 0.215, 1.9, 1.35, fov), cut: '' };
      }
      // The singer stands below the karaoke video, the crowd's heads at the bottom edge
      case 'sing': {
        // Fit the singer into the gap between the karaoke screen and whatever sits at the bottom
        const H = innerHeight;
        const tv = document.getElementById('tv')?.getBoundingClientRect();
        const lows = [...document.querySelectorAll('.tray > .show, .dock, .sing-bar')].map((e) => e.getBoundingClientRect()).filter((b) => b.height);
        const top = (tv?.height ? tv.bottom : H * 0.45) + 46;
        const bottom = lows.length ? Math.min(...lows.map((b) => b.top)) - 6 : H * 0.8;
        const px = clamp((bottom - top) * 0.92, 110, 420);
        const dist = (2.25 * H / px) / (2 * Math.tan(THREE.MathUtils.degToRad(20)));
        return { ...phoneFrame(0, -2.75, dist, ((top + bottom) / 2) / H, 1.35 + dist * 0.34, 1.45), cut: 'sing' };
      }
      case 'announce': return { ...phoneFrame(0, -2.2, 10.5, 0.5, 4.2, 1.2), cut: 'announce' };
      case 'vote': return phoneFrame(0, -1.2, 10.5, 0.5, 4.2, 1.2);
      // From the stage, a wide lens takes in the whole crowd holding up their scores
      case 'cards': return { pos: [1.2, 4.9, -4.5], look: [0.28, 0.55, 1.7], fov: 74, cut: 'cards' };
      // The singer, a little further back than on desktop so the big score has room above them
      case 'score': return { ...phoneFrame(0, -2.75, 6.6, 0.64, 2.3, 1.55), cut: 'score' };
      // The podium in the top third; the results list fills the rest
      case 'final': {
        const fov = 72;
        const d = clamp((7.1 / 0.96) / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * camera.aspect), 5.5, 10.5);
        return phoneFrame(0, -2.9, d, 0.25, 2.4, 1.6, fov);
      }
    }
    return null;
  }
  function shot() {
    if (override) return override;
    if (isPhone()) { const s = phoneShot(); if (s) return s; }
    const W = innerWidth;
    switch (shotName) {
      // The singer stands left of center, leaving room for the name card and wardrobe beside them
      case 'menu': return { pos: [1.1, 1.75, 2.85], look: [1.1, 1.72, -2.75], fov: 40 };
      case 'lobby': {
        // Fit the line-up between the side panels, but never so close that two singers fill the screen
        const free = W < 900 ? 0.9 : Math.max(0.35, (W - 680) / W);
        const d = clamp(fitDist(lobbyWidth, 40, free), 9.6, 14);
        return { pos: [0, 1.3 + d * 0.12, -2.95 + d], look: [0, 1.75, -2.95], fov: 40 };
      }
      case 'announce': return { pos: [0, 4.3, 8.4], look: [0, 1.2, -2.2], fov: 40, cut: 'announce' };
      // Singer on the right; the karaoke video sits over the left of the frame
      case 'sing': return { pos: [0, 3.0, 4.5], look: [-2.35, 2.2, -2.75], fov: 40, cut: 'sing' };
      case 'vote': return { pos: [0, 4.3, 8.4], look: [0, 1.2, -1.2], fov: 42 };
      case 'cards': return { pos: [1.75, 2.95, -4.5], look: [-0.1, 1.6, 1.7], fov: 48, cut: 'cards' };
      // In front of the crowd's seats, so nobody in the front row blocks the singer
      case 'score': return { pos: [0, 2.2, 1.05], look: [0, 2.0, -2.75], fov: 50, cut: 'score' };
      case 'final': {
        // Podium in the upper half; the result cards fill the bottom of the screen
        const d = clamp(fitDist(7.4, 40, 0.92), 8.5, 12);
        return { pos: [0, 2.2 + d * 0.06, -2.9 + d], look: [0, 0.95, -2.9], fov: 40 };
      }
    }
    return { pos: [0, 3, 8], look: [0, 1.3, -1], fov: 42 };
  }

  /** Crowd seats in front of the stage, spread evenly whatever the head count. */
  function seatFor(i, n) {
    return [(i - (n - 1) / 2) * 1.3, i % 2 ? 1.85 : 1.6];
  }

  /* ---------- Public API ---------- */
  const api = {
    /** Make the scene's characters match the players: [{ id, look }]. */
    setPlayers(players) {
      const ids = new Set(players.map((p) => p.id));
      for (const [id, c] of chars) if (!ids.has(id)) { puff(c.root.position); c.dispose(); chars.delete(id); }
      for (const p of players) {
        let c = chars.get(p.id);
        if (!c) { c = new Character(p.look, charCount++); chars.set(p.id, c); }
        else c.setLook(p.look);
      }
    },
    char: (id) => chars.get(id),
    /** menu: { me }. lobby: { ids }. game: { singer, crowd }. final: { ranked }. */
    setLayout(kind, o = {}) {
      layout = kind;
      podium.visible = kind === 'final';
      micStand.visible = kind !== 'final' && kind !== 'lobby';
      // The big titles sit where the neon sign is, so it switches off in the lobby and on the podium
      // (on a phone the menu has its own logo right where the sign would show)
      neonSign.visible = (kind === 'menu' && !isPhone()) || kind === 'game';
      if (kind === 'menu') {
        for (const [id, c] of chars) if (id !== o.me) c.hide();
        chars.get(o.me)?.moveTo(-0.72, STAGE_TOP, SPOT.z, 0.12);
      } else if (kind === 'lobby') {
        const n = o.ids.length;
        // On a phone the line-up squeezes together so everyone fits across a narrow screen
        const gap = isPhone() ? (n <= 3 ? 1.45 : n === 4 ? 1.22 : 1.06) : n <= 3 ? 1.9 : n === 4 ? 1.55 : 1.3;
        lobbyWidth = (n - 1) * gap + 1.8;
        o.ids.forEach((id, i) => chars.get(id)?.moveTo((i - (n - 1) / 2) * gap, STAGE_TOP, -2.95, 0));
      } else if (kind === 'game') {
        focusSinger = o.singer;
        chars.get(o.singer)?.moveTo(SPOT.x, STAGE_TOP, SPOT.z, 0);
        o.crowd.forEach((id, i) => { const [x, z] = seatFor(i, o.crowd.length); chars.get(id)?.moveTo(x, 0, z, Math.PI); });
      } else if (kind === 'final') {
        o.ranked.forEach((id, i) => {
          const c = chars.get(id);
          if (!c) return;
          if (i < 3) c.moveTo(PODIUM[i][0], STAGE_TOP + PODIUM[i][1], -2.9, 0);
          else c.moveTo((i % 2 ? -1 : 1) * (2.55 + Math.floor((i - 3) / 2) * 0.9), STAGE_TOP, -2.5, 0);
          c.mood = i < 3 ? 'happy' : 'sad';
        });
      }
      for (const c of chars.values()) { c.lowerCard(); if (kind !== 'game') c.singing = false; }
    },
    setShot(name) { shotName = name; },
    setLights(v) { lightTarget = v; },
    setFocus(v) { focus = v; },
    setBeat(b) { beatClock = b; },
    shake(v = 0.35) { shake = v; },
    setDisco(on) { discoOn = on; },
    jump(id, n) { chars.get(id)?.jump(n); },
    hit(id) { chars.get(id)?.hit(); },
    /** Squeaky Hammer: `by` bonks `target` after `delay` seconds; the hit lands `hit` seconds in. */
    bonk(by, target, delay, hit, daze) { bonks.push({ by, target, start: performance.now() / 1000 + delay, t: -delay, hit, daze }); },
    raiseCard(id, n) { chars.get(id)?.raiseCard(n); },
    lowerCards() { for (const c of chars.values()) c.lowerCard(); },
    setMood(id, m) { const c = chars.get(id); if (c) c.mood = m; },
    setTalk(id, v) { const c = chars.get(id); if (c) c.talkTarget = v; },
    setSinging(id, v) { const c = chars.get(id); if (c) c.singing = v; },
    resetMoods() { for (const c of chars.values()) { c.mood = 'happy'; c.singing = false; c.talkTarget = 0; c.lowerCard(); } },
    splatNear(id) { const c = chars.get(id); if (c) addSplat(c.root.position.x + rand(-0.7, 0.7), c.root.position.z + rand(0.15, 0.7)); },
    clearSplats() { splats.forEach((s) => scene.remove(s)); splats.length = 0; },
    confetti(sec = 6, z = -2.9) {
      confettiT = sec;
      conf.forEach((c) => { c.p.set(rand(-4, 4), rand(4, 7.5), z + rand(-2, 2)); c.v.set(rand(-0.3, 0.3), -rand(1, 2), 0); });
    },
    /** Screen position of a point above a character's head (for tags and flying emoji). */
    screenOf(id, above = 0) {
      const c = chars.get(id);
      if (!c || !c.root.visible || c.s < 0.5) return null;
      const extra = { party: 0.32, sprout: 0.2, wizard: 0.5, tophat: 0.38, chef: 0.3, crown: 0.24, halo: 0.3, propeller: 0.2, cowboy: 0.22, catears: 0.14, viking: 0.3, bunny: 0.5, afro: 0.42, beret: 0.08, flowers: 0.06, none: 0, mohawk: 0.24, santa: 0.5, unicorn: 0.38, devil: 0.14, antennae: 0.42, grad: 0.1, sombrero: 0.22, pirate: 0.22, mushroom: 0.18, buns: 0.18, astronaut: 0.2, frog: 0.1, bear: 0.1, jester: 0.42, fez: 0.2, bucket: 0.1, backcap: 0.06 }[c.look.hat] ?? 0.06;
      _h.copy(c.root.position).add(_v.set(0, (1.75 + extra + above) * c.s, 0)).project(camera);
      if (_h.z > 1) return null;
      return { x: (_h.x + 1) / 2 * innerWidth, y: (1 - _h.y) / 2 * innerHeight };
    },
    /** A rendered head-and-shoulders portrait of a look (color + hat), as a PNG data URL. Cached. */
    portrait(look, frame = 'head') {
      const keyName = `${look.color}|${look.hat}|${look.hatColor || ''}|${look.face || ''}|${look.mood || ''}|${look.outfit || ''}|${frame}`;
      if (portraits.has(keyName)) return portraits.get(keyName);
      const c = new Character(look, 99);
      c.set(200, 0, 200, 0);
      c.s = 1; c.visTarget = 1;
      c.root.scale.setScalar(1);
      c.blinkT = 99;
      for (let i = 0; i < 30; i++) c.update(0.05, 0, 0);
      c.root.traverse((o) => o.layers.set(1));
      const prevBg = scene.background;
      scene.background = null;
      // Frame from the shoulders to the tip of the hat, so tall hats never get cropped
      const top = frame === 'body' ? 1.85 : Math.max(2.02, new THREE.Box3().setFromObject(c.root).max.y + 0.12);
      const bottom = frame === 'body' ? 0.05 : 0.6;
      const mid = (top + bottom) / 2;
      const dist = ((top - bottom) / 2) / Math.tan(THREE.MathUtils.degToRad(15)) * 1.04;
      // Straight on at eye level: looking down at the face made the brows read as angry
      portraitCam.position.set(200 + dist * 0.1, mid, 200 + dist);
      portraitCam.lookAt(200, mid, 200);
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(portraitRT);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, portraitCam);
      renderer.readRenderTargetPixels(portraitRT, 0, 0, 256, 256, portraitBuf);
      renderer.setRenderTarget(prevTarget);
      scene.background = prevBg;
      c.dispose();
      const img = portraitCtx.createImageData(256, 256);
      for (let y = 0; y < 256; y++) img.data.set(portraitBuf.subarray((255 - y) * 1024, (256 - y) * 1024), y * 1024);
      portraitCtx.putImageData(img, 0, 0);
      const url = portraitCanvas.toDataURL('image/png');
      portraits.set(keyName, url);
      return url;
    },
    /** The player whose character is under a screen point, if any. */
    pick(x, y) {
      ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
      let best = null, bestD = Infinity;
      for (const [id, c] of chars) {
        if (!c.root.visible || c.s < 0.5) continue;
        const hits = ray.intersectObject(c.root, true);
        if (hits.length && hits[0].distance < bestD) { bestD = hits[0].distance; best = id; }
      }
      return best;
    },
    /** A steady screen point at height y over where a character stands (ignores jumps, hats and pop-in). */
    anchorOf(id, y) {
      const c = chars.get(id);
      if (!c) return null;
      _h.set(c.root.position.x, c.baseY + y, c.root.position.z).project(camera);
      if (_h.z > 1) return null;
      return { x: (_h.x + 1) / 2 * innerWidth, y: (1 - _h.y) / 2 * innerHeight };
    },
    paintText,
    step,
    /** Testing: force a camera shot ({ pos, look, fov }) or pass null to release it. */
    debugShot(o) { override = o; },
    render() { composer.render(); },
  };

  const _c = new THREE.Color();
  const dummy = new THREE.Object3D();
  let sizeKey = '';
  function resize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    sizeKey = `${w}x${h}`;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  function step(dt) {
    if (`${Math.max(1, innerWidth)}x${Math.max(1, innerHeight)}` !== sizeKey) resize();
    simT += dt;
    const t = simT;
    lightLevel = damp(lightLevel, lightTarget, lightTarget < lightLevel ? 14 : 4, dt);
    discoK = damp(discoK, discoOn ? 1 : 0, 3, dt);
    const L = lightLevel * (1 - 0.5 * discoK);
    hemi.intensity = BASE.hemi * (0.12 + 0.88 * L) * (focus ? 0.8 : 1);
    fill.intensity = BASE.fill * L * (focus ? 0.65 : 1);
    key.intensity = BASE.key * L;
    washes.forEach((w) => { w.intensity = BASE.wash * L; });
    roomFill.intensity = BASE.room * (0.2 + 0.8 * L);
    glowMats.forEach((m) => m.color.copy(m.userData.base).multiplyScalar(0.15 + 0.85 * L));
    const target = layout === 'game' && focusSinger && chars.get(focusSinger) ? chars.get(focusSinger).root.position : SPOT;
    key.target.position.lerp(_v.set(target.x, STAGE_TOP + 0.6, target.z), 1 - Math.exp(-6 * dt));

    const beat = beatClock || t / (60 / 84);
    for (let i = 0; i < BULBS; i++) {
      const chase = 0.45 + 0.55 * Math.pow(Math.max(0, Math.cos(((beat * 0.5 + i / 6) % 1) * Math.PI * 2)), 2);
      bulbs.setColorAt(i, _c.setRGB(2.55 * chase * L + 0.08, 1.88 * chase * L + 0.06, 0.73 * chase * L + 0.03));
    }
    bulbs.instanceColor.needsUpdate = true;
    footlights.forEach((l, k) => { l.intensity = BASE.foot * L * (0.7 + 0.3 * Math.max(0, Math.cos(((beat * 0.5 + k / 3) % 1) * Math.PI * 2))); });
    for (let i = 0; i < stringBulbs.length; i++) {
      const tw = (0.75 + 0.25 * Math.sin(t * 2 + i * 1.7)) * (0.25 + 0.75 * L);
      strings.setColorAt(i, _c.setRGB(1.7 * tw, 1.25 * tw, 0.78 * tw));
    }
    strings.instanceColor.needsUpdate = true;
    disco.rotation.y += dt * (0.6 + discoK * 3.4);
    disco.material.emissive.setScalar(discoK * 0.55);
    discoRig.visible = discoK > 0.01;
    discoHeads.forEach((h) => {
      h.light.intensity = 70 * discoK;
      if (discoK <= 0.01) return;
      const a = t * 1.25 + h.ph;
      h.light.target.position.set(Math.sin(a) * 3.4, 0, -1.6 + Math.cos(a * 0.83) * 2.8);
      _v.copy(h.light.target.position).sub(h.light.position).normalize();
      h.beam.quaternion.setFromUnitVectors(DOWN, _v);
      h.beam.material.opacity = 0.12 * discoK;
    });
    for (let i = 0; i < fairyBase.length; i++) {
      const tw = (0.7 + 0.3 * Math.sin(t * 2.6 + i * 2.1)) * (0.2 + 0.8 * L);
      fairy.setColorAt(i, _c.copy(fairyBase[i]).multiplyScalar(tw));
    }
    fairy.instanceColor.needsUpdate = true;
    lanterns.forEach((g) => { g.rotation.z = Math.sin(t * 0.8 + g.userData.ph) * 0.05; });

    for (let i = bonks.length - 1; i >= 0; i--) if (stepBonk(bonks[i])) bonks.splice(i, 1);
    for (const c of chars.values()) c.update(dt, t, beat);
    for (let i = puffs.length - 1; i >= 0; i--) {
      const g = puffs[i];
      g.userData.t += dt;
      const k = g.userData.t / 0.55;
      g.children.forEach((s) => { s.position.addScaledVector(s.userData.v, dt); s.userData.v.multiplyScalar(Math.exp(-4 * dt)); s.scale.setScalar(1 + k); s.material.opacity = clamp(1 - k, 0, 1); });
      if (k >= 1) { scene.remove(g); puffs.splice(i, 1); }
    }
    splats.forEach((s) => { s.userData.t += dt; s.scale.setScalar(Math.min(1, easeOut(clamp(s.userData.t * 5, 0, 1))) + 0.0001); });
    confetti.visible = confettiT > 0;
    if (confettiT > 0) {
      confettiT -= dt;
      conf.forEach((c, i) => {
        c.p.addScaledVector(c.v, dt);
        c.p.x += Math.sin(t * 2 + i) * dt * 0.4;
        c.r.x += c.rv.x * dt; c.r.y += c.rv.y * dt; c.r.z += c.rv.z * dt;
        if (c.p.y < 0 && confettiT > 1.5) c.p.y = rand(5, 7);
        dummy.position.copy(c.p); dummy.rotation.copy(c.r);
        dummy.scale.setScalar(c.p.y < 0 ? 0.0001 : 1);
        dummy.updateMatrix();
        confetti.setMatrixAt(i, dummy.matrix);
      });
      confetti.instanceMatrix.needsUpdate = true;
    }

    const S = shot();
    // Slide the picture up or down (phone layouts frame the stage around the UI)
    viewShift = damp(viewShift, S.shift || 0, 2.6, dt);
    if (Math.abs(viewShift) > 0.0005) camera.setViewOffset(innerWidth, innerHeight, 0, viewShift * innerHeight, innerWidth, innerHeight);
    else if (camera.view?.enabled) camera.clearViewOffset();
    if (S.cut && S.cut !== lastCut) { cam.pos.set(...S.pos); cam.look.set(...S.look); cam.fov = S.fov; }
    lastCut = S.cut || '';
    const k = 2.6;
    cam.pos.x = damp(cam.pos.x, S.pos[0], k, dt); cam.pos.y = damp(cam.pos.y, S.pos[1], k, dt); cam.pos.z = damp(cam.pos.z, S.pos[2], k, dt);
    cam.look.x = damp(cam.look.x, S.look[0], k, dt); cam.look.y = damp(cam.look.y, S.look[1], k, dt); cam.look.z = damp(cam.look.z, S.look[2], k, dt);
    cam.fov = damp(cam.fov, S.fov, k, dt);
    shake = damp(shake, 0, 6, dt);
    camera.position.set(cam.pos.x + Math.sin(t * 0.3) * 0.05 + (Math.random() - 0.5) * shake * 0.1, cam.pos.y + Math.sin(t * 0.45) * 0.025 + (Math.random() - 0.5) * shake * 0.1, cam.pos.z);
    camera.lookAt(cam.look);
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
  }

  return api;
}
