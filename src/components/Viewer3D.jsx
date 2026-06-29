// Visor 3D del modelo del llavero (Etapa 3). Renderiza las capas con three.js
// y permite orbitar/zoom con el mouse.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function Viewer3D({ model }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !model?.layers?.length) return;

    const width = mount.clientWidth || 400;
    const height = mount.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b0f17");

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    // Luces.
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(40, 60, 80);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-50, -20, -40);
    scene.add(fill);

    // Modelo: agrupar capas. Recostamos la pieza (Z arriba -> rotar -90° en X).
    const group = new THREE.Group();
    for (const layer of model.layers) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(layer.color),
        side: THREE.DoubleSide,
        roughness: 0.6,
        metalness: 0.0,
      });
      group.add(new THREE.Mesh(layer.geometry, mat));
    }
    group.rotation.x = -Math.PI / 2; // Z (altura) hacia arriba
    scene.add(group);

    // Encuadre segun tamaño del modelo.
    const r = Math.max(model.size.x, model.size.y, model.size.z) || 60;
    camera.position.set(r * 0.9, r * 1.1, r * 1.6);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      // Las geometrias son propiedad del modelo; liberamos solo materiales y DOM.
      group.traverse((o) => o.material?.dispose?.());
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [model]);

  return <div className="viewer3d" ref={mountRef} />;
}
