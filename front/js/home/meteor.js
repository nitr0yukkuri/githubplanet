import * as THREE from 'three';
import anime from 'animejs';

export function spawnMeteor({ scene, camera, webglAvailable }, data) {
    if (!scene || !camera || !webglAvailable) return;

    // ★追加: サーバーから scale を受け取る（なければ 1.0）
    const scale = data.scale || 1.0;

    const baseColor = new THREE.Color(data.color || '#ffffff');
    const meteorGroup = new THREE.Group();
    meteorGroup.renderOrder = 9999;

    const starShape = new THREE.Shape();
    const points = 5;
    const outerRadius = 0.7;
    const innerRadius = 0.35;

    for (let i = 0; i < points * 2; i++) {
        const angle = (i * Math.PI) / points;
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const x = Math.sin(angle) * radius;
        const y = Math.cos(angle) * radius;
        if (i === 0) starShape.moveTo(x, y);
        else starShape.lineTo(x, y);
    }
    starShape.closePath();

    const headGeo = new THREE.ExtrudeGeometry(starShape, {
        depth: 0.15,
        bevelEnabled: false
    });
    headGeo.center();

    const headMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: true,
        fog: false
    });
    const head = new THREE.Mesh(headGeo, headMat);
    meteorGroup.add(head);

    const tailLength = 60;
    const glowGeo = new THREE.CylinderGeometry(1.0, 0.0, tailLength * 0.9, 16, 1, true);
    glowGeo.translate(0, -tailLength / 2 + 0.5, 0);
    glowGeo.rotateX(Math.PI / 2);

    const glowMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        depthTest: true,
        fog: false
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    meteorGroup.add(glow);

    const startZ = -60 - Math.random() * 40;
    const startY = 30 + Math.random() * 20;

    const localStart = new THREE.Vector3(120, startY, startZ);
    const localEnd = new THREE.Vector3(-120, startY - 10, startZ);

    const startPos = localStart.applyQuaternion(camera.quaternion).add(camera.position);
    const endPos = localEnd.applyQuaternion(camera.quaternion).add(camera.position);

    meteorGroup.position.copy(startPos);
    meteorGroup.lookAt(endPos);
    meteorGroup.scale.set(0, 0, 0);

    scene.add(meteorGroup);

    // ★修正: 重厚感の演出 (scale > 3.0 なら遅くする)
    let baseDuration = 1000 + Math.random() * 500;
    if (scale > 3.0) {
        baseDuration = baseDuration * 2.5; // 巨大な場合は2.5倍の時間をかけてゆっくり飛ぶ
    }
    const duration = baseDuration;

    // ★修正: scale を適用
    anime({
        targets: meteorGroup.scale,
        x: scale,
        y: scale,
        z: scale,
        easing: 'easeOutElastic(1, .6)',
        duration: 400
    });

    anime({
        targets: head.material,
        opacity: 1.0,
        easing: 'easeOutQuad',
        duration: 200
    });
    anime({
        targets: glow.material,
        opacity: 0.8,
        easing: 'easeOutQuad',
        duration: 200
    });

    anime({
        targets: meteorGroup.position,
        x: endPos.x,
        y: endPos.y,
        z: endPos.z,
        easing: 'linear',
        duration: duration,
        update: (anim) => {
            const progress = anim.progress;
            if (progress > 85) {
                const fade = 1.0 - ((progress - 85) / 15);
                head.material.opacity = fade;
                glow.material.opacity = 0.8 * fade;
            }
        },
        complete: () => {
            scene.remove(meteorGroup);
            headGeo.dispose(); headMat.dispose();
            glowGeo.dispose(); glowMat.dispose();
        }
    });

    // 回転アニメーションの時間も合わせる
    anime({
        targets: head.rotation,
        z: Math.PI * 10,
        easing: 'linear',
        duration: duration
    });
}
