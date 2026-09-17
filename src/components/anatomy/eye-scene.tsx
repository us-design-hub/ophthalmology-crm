"use client";

import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { DoubleSide, Vector3, type MeshStandardMaterialParameters } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { type AnatomySite, type Eye, SITE_COLORS } from "@/lib/anatomy";

type Props = {
  eye: Eye; selected: AnatomySite | null; onSelect: (site: AnatomySite) => void;
  cutaway: boolean; resetKey: number; zoom: number; onUnavailable: () => void;
};

function Controls({ resetKey, zoom, onUnavailable }: Pick<Props, "resetKey" | "zoom" | "onUnavailable">) {
  const { camera, gl, invalidate } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.target.set(.12, 0, 0);
    orbit.enablePan = false;
    orbit.minDistance = 2.8;
    orbit.maxDistance = 7;
    orbit.rotateSpeed = .7;
    orbit.zoomSpeed = .6;
    const requestFrame = () => {
      // Expose camera pose for diagnostics without relying on unstable GPU screenshot bytes.
      gl.domElement.dataset.cameraPose = [...camera.position.toArray(), ...camera.quaternion.toArray()].map(value => value.toFixed(5)).join(",");
      invalidate();
    };
    orbit.addEventListener("change", requestFrame);
    orbit.update();
    requestFrame();
    orbit.saveState();
    controls.current = orbit;
    const contextLost = (event: Event) => { event.preventDefault(); onUnavailable(); };
    gl.domElement.addEventListener("webglcontextlost", contextLost);
    return () => {
      orbit.removeEventListener("change", requestFrame);
      orbit.dispose();
      gl.domElement.removeEventListener("webglcontextlost", contextLost);
      controls.current = null;
    };
  }, [camera, gl, invalidate, onUnavailable]);

  useEffect(() => {
    controls.current?.reset();
    invalidate();
  }, [resetKey, invalidate]);

  useEffect(() => {
    const target = controls.current?.target ?? new Vector3(.12, 0, 0);
    const direction = camera.position.clone().sub(target).normalize();
    camera.position.copy(target).addScaledVector(direction, 4.5 - zoom * .35);
    controls.current?.update();
    invalidate();
  }, [zoom, resetKey, camera, invalidate]);
  return null;
}

function EyeModel({ eye, selected, onSelect, cutaway }: Pick<Props, "eye" | "selected" | "onSelect" | "cutaway">) {
  const [hovered, setHovered] = useState<AnatomySite | null>(null);
  const accent = eye === "OD" ? "#277b92" : "#a5404c";
  const bind = (site: AnatomySite) => ({
    onClick: (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect(site); },
    onPointerOver: (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); setHovered(site); },
    onPointerOut: () => setHovered(null),
  });
  const material = (site: AnatomySite, extra: MeshStandardMaterialParameters = {}) => ({
    color: SITE_COLORS[site], roughness: .42, metalness: .025,
    emissive: selected === site ? accent : hovered === site ? SITE_COLORS[site] : "#000000",
    emissiveIntensity: selected === site ? .55 : hovered === site ? .22 : 0,
    ...extra,
  });
  // Positive-z half is removed for cutaway, exposing inner structures to the initial camera.
  const shellArgs = (radius: number): [number, number, number, number, number] => [radius, 64, 40, cutaway ? Math.PI : 0, cutaway ? Math.PI : Math.PI * 2];
  const fibres = useMemo(() => [-.1, -.05, 0, .05, .1], []);

  return <group rotation={[0, -.15, -.08]}>
    <mesh {...bind("sclera")}>
      <sphereGeometry args={shellArgs(1.03)} />
      <meshStandardMaterial {...material("sclera", { side: DoubleSide })} />
    </mesh>
    {cutaway && <>
      <mesh {...bind("retina")}><sphereGeometry args={shellArgs(.98)} /><meshStandardMaterial {...material("retina", { side: DoubleSide })} /></mesh>
      <mesh {...bind("sclera")}><torusGeometry args={[1.015, .023, 12, 96]} /><meshStandardMaterial {...material("sclera")} /></mesh>
      <mesh {...bind("retina")}><torusGeometry args={[.97, .023, 12, 96]} /><meshStandardMaterial {...material("retina")} /></mesh>
      <mesh position={[.08, 0, -.12]} {...bind("vitreous")}>
        <sphereGeometry args={[.86, 40, 32, Math.PI, Math.PI]} />
        <meshStandardMaterial {...material("vitreous", { transparent: true, opacity: .57, side: DoubleSide, depthWrite: false })} />
      </mesh>
      <mesh position={[.9, -.17, .01]} scale={[.15, .13, .06]} {...bind("macula")}>
        <sphereGeometry args={[1, 24, 16]} /><meshStandardMaterial {...material("macula")} />
      </mesh>
    </>}
    <mesh position={[-.96, 0, 0]} scale={[.29, .62, .62]} {...bind("cornea")}>
      <sphereGeometry args={[1, 40, 32, cutaway ? Math.PI : 0, cutaway ? Math.PI : Math.PI * 2]} />
      <meshStandardMaterial {...material("cornea", { transparent: true, opacity: .5, side: DoubleSide, depthWrite: false })} />
    </mesh>
    <mesh position={[-.94, 0, -.025]} scale={[.15, .46, .46]} {...bind("anterior_chamber")}>
      <sphereGeometry args={[1, 32, 24, cutaway ? Math.PI : 0, cutaway ? Math.PI : Math.PI * 2]} />
      <meshStandardMaterial {...material("anterior_chamber", { transparent: true, opacity: .6, depthWrite: false, side: DoubleSide })} />
    </mesh>
    <mesh position={[-.83, 0, 0]} rotation={[0, Math.PI / 2, 0]} {...bind("iris")}>
      <ringGeometry args={[.18, .5, 64, 1, cutaway ? Math.PI / 2 : 0, cutaway ? Math.PI : Math.PI * 2]} />
      <meshStandardMaterial {...material("iris", { side: DoubleSide })} />
    </mesh>
    <mesh position={[-.65, 0, 0]} scale={[.16, .39, .39]} {...bind("lens")}>
      <sphereGeometry args={[1, 40, 32]} /><meshStandardMaterial {...material("lens", { roughness: .24 })} />
    </mesh>
    <group position={[1.32, .045, -.1]} rotation={[0, 0, -Math.PI / 2 + .12]} {...bind("optic_nerve")}>
      <mesh><cylinderGeometry args={[.18, .24, .77, 32]} /><meshStandardMaterial {...material("optic_nerve")} /></mesh>
      {fibres.map((z, i) => <mesh key={z} position={[Math.sin(i) * .065, 0, z]}><cylinderGeometry args={[.012, .012, .8, 8]} /><meshStandardMaterial color="#c89251" /></mesh>)}
    </group>
    {[-1, 1].map(side => <mesh key={side} position={[.16, side * .965, -.14]} rotation={[0, 0, side * .03]} scale={[.87, .095, .21]} {...bind("extraocular_muscles")}>
      <sphereGeometry args={[1, 32, 20]} /><meshStandardMaterial {...material("extraocular_muscles")} />
    </mesh>)}
    <mesh position={[-.73, .47, -.07]} rotation={[0, Math.PI / 2, -.15]} {...bind("adnexa")}>
      <torusGeometry args={[.55, .075, 14, 36, Math.PI]} /><meshStandardMaterial {...material("adnexa")} />
    </mesh>
  </group>;
}

export default function EyeScene(props: Props) {
  return <div className="scene-canvas" data-testid={`scene-${props.eye}`} aria-hidden="true">
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [-.4, .4, 4.5], fov: 38 }} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={1.25} />
      <directionalLight position={[-3, 5, 7]} intensity={2.3} color="#fff8eb" />
      <directionalLight position={[4, -2, 3]} intensity={.7} color="#c0dfdf" />
      <EyeModel {...props} />
      <Controls resetKey={props.resetKey} zoom={props.zoom} onUnavailable={props.onUnavailable} />
    </Canvas>
  </div>;
}
