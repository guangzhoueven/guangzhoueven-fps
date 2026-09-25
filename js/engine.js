// ============================================================================
// ENGINE — Three.js renderer / scene / camera / lights
// ============================================================================
// ============================================================================
// THREE.JS SETUP
// ============================================================================
const canvas = document.getElementById('game-canvas') || document.querySelector('canvas');
if(!canvas.parentElement){ canvas.style.display='block'; document.body.appendChild(canvas); }
const renderer = new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.0));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a8c8);
scene.fog = new THREE.FogExp2(0x9ab4d0, 0.0008);

const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 300);
camera.position.set(0, 1.6, 0);
camera.rotation.order = 'YXZ';
scene.add(camera);

const clock = new THREE.Clock();
let yaw=0, pitch=0;

// Lighting — references for dynamic sky
const ambientLight = new THREE.AmbientLight(0xffeedd, 1.8);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xfff4d8, 2.0);
sunLight.position.set(30, 50, 20);
scene.add(sunLight);
const hemiLight = new THREE.HemisphereLight(0x87c8ff, 0x6a6050, 1.2);
scene.add(hemiLight);
// Room lights only for initial rooms (generated rooms get their own lights in buildRoom)

// Flashlight
const flashlight = new THREE.SpotLight(0xfff0cc, 0, 45, Math.PI/4, 0.5, 1.0);
camera.add(flashlight);
flashlight.target.position.set(0,-0.1,-1);
camera.add(flashlight.target);
