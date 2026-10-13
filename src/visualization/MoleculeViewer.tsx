import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Dataset, Metadata } from "../domain/types";
import { speciesColors } from "./palette";
export function MoleculeViewer({
  data,
  frame,
  metadata,
  visible,
  trail,
}: {
  data: Dataset;
  frame: number;
  metadata: Metadata;
  visible: string[];
  trail: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const update = useRef<((frame: number) => void) | null>(null);
  const currentFrame = useRef(frame);
  currentFrame.current = frame;
  const [error, setError] = useState("");
  useEffect(() => {
    if (!host.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setError(
        "WebGL is unavailable. Dataset inspection and numerical analysis remain available.",
      );
      return;
    }
    setError("");
    const node = host.current;
    node.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive molecular trajectory; drag to rotate, scroll to zoom",
    );
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f7f9fa");
    const physical = metadata.confirmed;
    const cell = physical ? metadata.cell : [1, 1, 1];
    const max = Math.max(...cell);
    const scale = cell.map((v) => v / max);
    const geometry = new THREE.SphereGeometry(0.012, 16, 12);
    const box = new THREE.BoxGeometry(...(scale as [number, number, number]));
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    scene.add(
      new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: "#adbfc5" }),
      ),
    );
    scene.add(new THREE.HemisphereLight("#ffffff", "#61747e", 2.4));
    const light = new THREE.DirectionalLight("#ffffff", 2.1);
    light.position.set(2, 3, 4);
    scene.add(light);
    const mapped = (atom: number, f: number) => {
      const xyz = data.frames[f].positions;
      return new THREE.Vector3(
        ...([0, 1, 2].map((axis) => {
          let val = xyz[atom * 3 + axis];
          if (physical) {
            if (metadata.coordinates === "fractional") val *= cell[axis];
            if (metadata.periodic)
              val = ((val % cell[axis]) + cell[axis]) % cell[axis];
            return (val - cell[axis] / 2) / max;
          }
          return val - 0.5;
        }) as [number, number, number]),
      );
    };
    const group = new THREE.Group();
    scene.add(group);
    const draw = (frame: number) => {
      while (group.children.length) {
        const obj = group.children[0] as THREE.Mesh;
        group.remove(obj);
        if (obj.geometry !== geometry) obj.geometry.dispose();
        const mats = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        mats.forEach((m) => m?.dispose());
      }
      data.species.forEach((sp, index) => {
        if (!visible.includes(sp.name)) return;
        const atoms = sp.end - sp.start + 1;
        const mesh = new THREE.InstancedMesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: speciesColors[index % speciesColors.length],
            roughness: 0.4,
          }),
          atoms,
        );
        const dummy = new THREE.Object3D();
        for (let a = sp.start; a <= sp.end; a++) {
          dummy.position.copy(mapped(a, frame));
          dummy.updateMatrix();
          mesh.setMatrixAt(a - sp.start, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
        if (trail && frame > 0) {
          const vertices: number[] = [];
          for (let a = sp.start; a <= Math.min(sp.end, sp.start + 99); a++)
            for (let f = Math.max(1, frame - 20); f <= frame; f++) {
              const prev = mapped(a, f - 1),
                next = mapped(a, f);
              if (
                metadata.periodic &&
                physical &&
                [0, 1, 2].some(
                  (axis) =>
                    Math.abs(
                      prev.getComponent(axis) - next.getComponent(axis),
                    ) >
                    scale[axis] / 2,
                )
              )
                continue;
              vertices.push(...prev.toArray(), ...next.toArray());
            }
          const lines = new THREE.BufferGeometry();
          lines.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(vertices, 3),
          );
          group.add(
            new THREE.LineSegments(
              lines,
              new THREE.LineBasicMaterial({
                color: speciesColors[index % speciesColors.length],
                transparent: true,
                opacity: 0.35,
              }),
            ),
          );
        }
      });
    };
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    camera.position.set(1.65, 1.2, 1.9);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    update.current = (frame) => {
      draw(frame);
      render();
    };
    update.current(currentFrame.current);
    const resize = () => {
      const w = node.clientWidth,
        h = node.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    return () => {
      update.current = null;
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        const o = object as THREE.Mesh;
        if (o.geometry) o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m?.dispose());
      });
      geometry.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [data, metadata, visible, trail]);
  useEffect(() => {
    update.current?.(frame);
  }, [frame]);
  return (
    <div className="molecule" ref={host}>
      {error && (
        <div className="viewer-error" role="status">
          {error}
        </div>
      )}
      <div className="viewer-label">
        {metadata.confirmed
          ? `Orthorhombic cell · ${metadata.lengthUnit}`
          : "Fractional-coordinate preview · unit cell assumption"}
      </div>
    </div>
  );
}
