import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import type { MidiAudioEngine } from "./audio-engine";

const TRACKS = [
  "kick", "snare", "hat", "ohat", "clap", "tom", "perc", "bass", "chord", "lead",
] as const;
const COLORS: Readonly<Record<typeof TRACKS[number], number>> = {
  kick: 0xff4f00, snare: 0xffa300, hat: 0xedeae2, ohat: 0x9fb4c7, clap: 0xff2d55,
  tom: 0xffd400, perc: 0x7dffb0, bass: 0x36e0ff, chord: 0xb68cff, lead: 0x7ee787,
};

interface AnimatedPad extends THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
  userData: { flash: number; lift: number; track: typeof TRACKS[number] };
}

export function MidiVisualizer({ engine }: { engine: MidiAudioEngine }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const host = canvas.parentElement;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 160);
    camera.position.set(1.5, 10.4, 13.8);
    const rig = new THREE.Group();
    rig.position.x = 2.2;
    rig.scale.setScalar(1.2);
    scene.add(rig);
    scene.add(new THREE.AmbientLight(0x58616d, 1.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
    keyLight.position.set(6, 14, 8);
    scene.add(keyLight);
    const rim = new THREE.DirectionalLight(0xff4f00, 0.85);
    rim.position.set(-9, 4, -8);
    scene.add(rim);
    const under = new THREE.PointLight(0x36e0ff, 30, 28, 2);
    under.position.set(0, -2.5, 0);
    scene.add(under);

    const stepSpacing = 0.86;
    const trackSpacing = 0.82;
    const stepX = (step: number) => (step - 7.5) * stepSpacing;
    const trackZ = (track: number) => (track - (TRACKS.length - 1) / 2) * trackSpacing;
    const bodyGeometry = new THREE.BoxGeometry(16 * stepSpacing + 1.2, 0.5, TRACKS.length * trackSpacing + 1.25);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x292821, metalness: 0.18, roughness: 0.84 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = -0.4;
    rig.add(body);

    const padGeometry = new THREE.BoxGeometry(stepSpacing * 0.72, 0.24, trackSpacing * 0.65);
    const pads = new Map<string, AnimatedPad>();
    for (let trackIndex = 0; trackIndex < TRACKS.length; trackIndex += 1) {
      const track = TRACKS[trackIndex];
      for (let step = 0; step < 16; step += 1) {
        const material = new THREE.MeshStandardMaterial({
          color: step % 4 === 0 ? 0x46443b : 0x32302a,
          emissive: 0x000000,
          metalness: 0.32,
          roughness: 0.42,
        });
        const pad = new THREE.Mesh(padGeometry, material) as AnimatedPad;
        pad.position.set(stepX(step), 0, trackZ(trackIndex));
        pad.userData = { flash: 0, lift: 0, track };
        rig.add(pad);
        pads.set(`${track}:${step}`, pad);
      }
    }

    const headMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending, color: 0xff4f00, depthWrite: false, opacity: 0.11, transparent: true,
    });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.76, 4.8, TRACKS.length * trackSpacing + 1), headMaterial);
    head.position.y = 1.7;
    rig.add(head);

    const bars: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
    for (let index = 0; index < 24; index += 1) {
      const angle = (index / 23 - 0.5) * Math.PI * 0.92;
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 1, 0.25),
        new THREE.MeshBasicMaterial({ color: 0xff4f00, opacity: 0.42, transparent: true }),
      );
      bar.position.set(Math.sin(angle) * 11.5, 0, -Math.cos(angle) * 7 - 3.3);
      bar.rotation.y = angle;
      rig.add(bar);
      bars.push(bar);
    }

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.72, 0.62, 0.2);
    preserveBloomTransparency(bloom);
    composer.addPass(bloom);
    const frequencies = new Uint8Array(engine.getAnalyser().frequencyBinCount);
    let activeStep = 0;
    let pointerX = 0;
    let pointerY = 0;
    let frame = 0;
    let previous = performance.now();

    const unsubscribe = engine.onPulse(({ hits, step }) => {
      const barStep = step % 16;
      activeStep = barStep;
      for (const hit of hits) {
        const pad = pads.get(`${hit}:${barStep}`);
        if (pad) {
          pad.userData.flash = 1;
          pad.userData.lift = 1;
        }
      }
    });
    const onPointerMove = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    };
    host.addEventListener("pointermove", onPointerMove);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const render = (now: number) => {
      const delta = Math.min((now - previous) / 1_000, 0.05);
      previous = now;
      const seconds = now / 1_000;
      for (const pad of pads.values()) {
        pad.userData.flash = Math.max(0, pad.userData.flash - delta * 3.4);
        pad.userData.lift = Math.max(0, pad.userData.lift - delta * 4.2);
        const color = COLORS[pad.userData.track];
        pad.material.emissive.setHex(color).multiplyScalar(pad.userData.flash * 1.7);
        pad.position.y = pad.userData.lift * 0.58;
        pad.scale.y = 1 + pad.userData.lift * 1.8;
      }
      head.position.x += (stepX(activeStep) - head.position.x) * Math.min(1, delta * 22);
      engine.getAnalyser().getByteFrequencyData(frequencies);
      bars.forEach((bar, index) => {
        const value = frequencies[Math.floor(index * frequencies.length / bars.length)] / 255;
        const height = 0.12 + value * value * 4.8;
        bar.scale.y += (height - bar.scale.y) * Math.min(1, delta * 14);
        bar.position.y = bar.scale.y / 2 - 0.7;
        bar.material.opacity = 0.13 + value * 0.55;
      });
      rig.rotation.y = Math.sin(seconds * 0.16) * 0.07 + pointerX * 0.1;
      camera.position.x += (pointerX * 1.25 + 1.5 - camera.position.x) * delta * 1.8;
      camera.position.y += (11.2 - pointerY * 1.1 - camera.position.y) * delta * 1.8;
      camera.lookAt(1.1, 1.7, 0);
      under.intensity = 21 + Math.sin(seconds * 3) * 5;
      composer.render();
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      resizeObserver.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      composer.dispose();
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      padGeometry.dispose();
      for (const pad of pads.values()) pad.material.dispose();
      for (const bar of bars) {
        bar.geometry.dispose();
        bar.material.dispose();
      }
      head.geometry.dispose();
      headMaterial.dispose();
      renderer.dispose();
    };
  }, [engine]);

  return <canvas aria-label="Animated loop sequencer" className="midi-visualizer-canvas" ref={canvasRef} />;
}

function preserveBloomTransparency(bloom: UnrealBloomPass): void {
  for (const material of bloom.separableBlurMaterials) {
    material.fragmentShader = material.fragmentShader.replace(
      "gl_FragColor = vec4(diffuseSum/weightSum, 1.0);",
      "gl_FragColor = vec4(diffuseSum / weightSum, 0.0);",
    );
    material.needsUpdate = true;
  }
}
