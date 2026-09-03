"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import {
  createVisibilityLifecycle,
  getClampedDpr,
  prefersReducedMotion,
} from "@/lib/dotSystem/runtime";

const HERO_LILAC = new THREE.Color("#ccb3eb");
const HERO_VIOLET = new THREE.Color("#8c57c7");

const INNER_VERT = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormalDir;
  void main() {
    vLocal = position;
    vNormalDir = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const INNER_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying vec3 vLocal;
  varying vec3 vNormalDir;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z
    );
  }
  float fbm(vec3 p) {
    float sum = 0.0;
    float amp = 0.55;
    for (int i = 0; i < 4; i++) {
      sum += noise3(p) * amp;
      p = p * 2.03 + 7.1;
      amp *= 0.48;
    }
    return sum;
  }

  void main() {
    vec3 flowP = vLocal * 2.25 + vec3(uTime * 0.07, -uTime * 0.045, uTime * 0.035);
    float cloud = smoothstep(0.34, 0.82, fbm(flowP));
    float wisps = smoothstep(0.52, 0.76, fbm(flowP * 1.8 + 12.0));
    vec3 nebula = mix(vec3(0.20, 0.13, 0.38), vec3(0.55, 0.34, 0.78), cloud);
    nebula = mix(nebula, vec3(0.80, 0.70, 0.92), wisps * 0.48);

    vec3 starCell = floor((vLocal + vNormalDir * 0.17) * 34.0);
    float starSeed = hash31(starCell);
    float star = smoothstep(0.986, 0.999, starSeed);
    float twinkle = 0.68 + 0.32 * sin(uTime * (1.2 + starSeed * 2.0) + starSeed * 80.0);
    vec3 color = nebula * (0.45 + cloud * 0.48) + vec3(1.0, 0.96, 1.0) * star * twinkle * 1.8;
    float alpha = 0.2 + cloud * 0.35 + wisps * 0.16 + star * 0.72;
    gl_FragColor = vec4(color, alpha);
  }
`;

function createGeometry(variant: number): THREE.BufferGeometry {
  switch (variant % 4) {
    case 0:
      return new THREE.SphereGeometry(0.72, 48, 32);
    case 1:
      return new THREE.OctahedronGeometry(0.9, 0);
    case 2:
      return new THREE.TorusKnotGeometry(0.55, 0.18, 96, 16, 2, 3);
    default:
      return new THREE.DodecahedronGeometry(0.82, 0);
  }
}

export function CrystalCardGeometry({ variant, active }: { variant: number; active: boolean }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduce = prefersReducedMotion();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(1.75, getClampedDpr()));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room);
    scene.environment = environment.texture;
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
    camera.position.set(0, 0, 4.2);

    const geometry = createGeometry(variant);
    const material = new THREE.MeshPhysicalMaterial({
      // 与 Hero 水晶球一致：长春花紫主体、中紫体积吸收、虹彩色散边。
      color: new THREE.Color("#ccb3eb"),
      roughness: 0.24,
      metalness: 0,
      transmission: 0.48,
      thickness: 1.55,
      ior: 1.47,
      dispersion: 0.16,
      attenuationColor: new THREE.Color("#8c57c7"),
      attenuationDistance: 0.92,
      iridescence: 1,
      iridescenceIOR: 1.42,
      iridescenceThicknessRange: [120, 760],
      clearcoat: 0.38,
      clearcoatRoughness: 0.24,
      sheen: 0.38,
      sheenColor: new THREE.Color("#ccb3eb"),
      sheenRoughness: 0.28,
      specularIntensity: 0.42,
      specularColor: new THREE.Color("#ffffff"),
      envMapIntensity: 0.34,
      emissive: new THREE.Color("#332161"),
      emissiveIntensity: 0.09,
      transparent: false,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.setScalar(1.22);
    mesh.rotation.set(
      variant === 0 ? 0.58 : 0.38,
      variant === 0 ? 0.68 : -0.5 + variant * 0.28,
      variant === 0 ? -0.08 : 0.12,
    );
    scene.add(mesh);

    const innerUniforms = { uTime: { value: 0 } };
    const innerMaterial = new THREE.ShaderMaterial({
      uniforms: innerUniforms,
      vertexShader: INNER_VERT,
      fragmentShader: INNER_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    const innerMesh = new THREE.Mesh(geometry, innerMaterial);
    innerMesh.scale.copy(mesh.scale).multiplyScalar(0.8);
    innerMesh.rotation.copy(mesh.rotation);
    scene.add(innerMesh);

    // 「前沿内容」：实心球体核心 + 三条交叉空间轨道 + 三个节点。
    // 轨道使用极细管体而不是 CSS 椭圆，旋转时仍保持真实 3D 穿插关系。
    const orbitGroup = new THREE.Group();
    const orbitGeometries: THREE.BufferGeometry[] = [];
    const orbitMaterials: THREE.Material[] = [];
    if (variant === 0) {
      const ringRotations: Array<[number, number, number]> = [
        [1.08, 0.2, 0.38],
        [0.38, 1.0, -0.28],
        [1.34, -0.62, 0.12],
      ];
      const nodeAngles = [0.18, 2.18, 4.92];
      ringRotations.forEach((rotation, index) => {
        const ringGroup = new THREE.Group();
        ringGroup.rotation.set(...rotation);

        const ringGeometry = new THREE.TorusGeometry(1.22, 0.009, 6, 128);
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: index === 1 ? 0xd97bd1 : 0xeba1cc,
          transparent: true,
          opacity: index === 2 ? 0.38 : 0.66,
        });
        ringGroup.add(new THREE.Mesh(ringGeometry, ringMaterial));
        orbitGeometries.push(ringGeometry);
        orbitMaterials.push(ringMaterial);

        const nodeGeometry = new THREE.SphereGeometry(0.065, 18, 12);
        const nodeMaterial = new THREE.MeshPhysicalMaterial({
          color: index === 0 ? 0xff3358 : 0xf28fbd,
          roughness: 0.12,
          clearcoat: 1,
          emissive: new THREE.Color(index === 0 ? "#b8173c" : "#8c315f"),
          emissiveIntensity: 0.28,
        });
        const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
        node.position.set(Math.cos(nodeAngles[index]) * 1.22, Math.sin(nodeAngles[index]) * 1.22, 0);
        ringGroup.add(node);
        orbitGeometries.push(nodeGeometry);
        orbitMaterials.push(nodeMaterial);
        orbitGroup.add(ringGroup);
      });
      scene.add(orbitGroup);
    }

    scene.add(new THREE.HemisphereLight(0xf5f1ff, 0x2a193f, 1.25));
    const key = new THREE.PointLight(0xffffff, 8, 8);
    key.position.set(-2.1, 2.4, 3.2);
    scene.add(key);
    const violet = new THREE.PointLight(HERO_VIOLET, 7, 7);
    violet.position.set(2.3, -1.5, 2.2);
    scene.add(violet);
    const cyan = new THREE.PointLight(0x8fd8e5, 4, 6);
    cyan.position.set(-1.8, -1.6, 1.4);
    scene.add(cyan);
    const rose = new THREE.PointLight(0xf3a7c7, 3.5, 6);
    rose.position.set(1.8, 1.4, 1.2);
    scene.add(rose);
    const gold = new THREE.PointLight(0xffd59a, 2, 5);
    gold.position.set(-0.4, 2.6, 0.8);
    scene.add(gold);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let raf = 0;
    let running = false;
    let last = performance.now();
    const render = (now = performance.now()) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const speed = activeRef.current ? 0.7 : 0.16;
      mesh.rotation.y += dt * speed;
      mesh.rotation.x += dt * speed * 0.28;
      innerMesh.rotation.copy(mesh.rotation);
      innerUniforms.uTime.value = now * 0.001;
      if (variant === 0) {
        orbitGroup.rotation.y += dt * speed * 0.13;
        orbitGroup.rotation.z += dt * speed * 0.035;
      }
      const flow = now * 0.00045 + variant * 1.7;
      key.position.x = Math.cos(flow) * 2.4;
      key.position.y = 1.7 + Math.sin(flow * 1.2) * 0.8;
      violet.position.x = Math.cos(flow + Math.PI) * 2.2;
      // 基础紫色也缓慢在 Hero 的长春花紫 / 中紫之间流动，避免白色环境反射
      // 把小尺寸几何体重新洗成无色。
      material.color
        .copy(HERO_LILAC)
        .lerp(HERO_VIOLET, 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(flow)));
      cyan.position.y = Math.sin(flow * 1.35) * 1.8;
      rose.position.x = Math.cos(flow * 0.82) * 2.1;
      renderer.render(scene, camera);
      if (running) raf = requestAnimationFrame(render);
    };

    const start = () => {
      if (running || reduce) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(render);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const disposeVisibility = reduce
      ? (() => {
          render();
          return () => {};
        })()
      : createVisibilityLifecycle(mount, { onVisible: start, onHidden: stop });

    return () => {
      stop();
      disposeVisibility();
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      innerMaterial.dispose();
      environment.dispose();
      room.dispose();
      pmrem.dispose();
      orbitGeometries.forEach((item) => item.dispose());
      orbitMaterials.forEach((item) => item.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [variant]);

  return <div ref={mountRef} aria-hidden className="my-5 size-[148px] shrink-0 md:my-7" />;
}
