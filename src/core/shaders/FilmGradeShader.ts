/**
 * Single combined grading pass: vignette, very subtle edge-only chromatic
 * aberration, fine animated film grain, and a slight contrast/saturation
 * lift. Runs in linear HDR space (before OutputPass tone-maps), so the
 * contrast lift is a gentle power curve around mid-grey rather than an
 * 0-1 s-curve.
 */
export const FilmGradeShader = {
  name: 'FilmGradeShader',

  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grainAmount: { value: 0.05 },
    vignetteAmount: { value: 0.24 },
    aberrationAmount: { value: 0.0018 },
    contrast: { value: 1.03 },
    saturation: { value: 1.07 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float grainAmount;
    uniform float vignetteAmount;
    uniform float aberrationAmount;
    uniform float contrast;
    uniform float saturation;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7)) + fract(time) * 43.7585) * 43758.5453);
    }

    void main() {
      vec2 fromCenter = vUv - 0.5;
      float dist2 = dot(fromCenter, fromCenter); // 0 center .. 0.5 corners

      // Chromatic aberration: zero at the center, barely visible at the edges.
      vec2 caOffset = fromCenter * dist2 * aberrationAmount * 2.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + caOffset).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - caOffset).b;

      // Saturation and gentle contrast around mid-grey (linear-space safe).
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(luma), col, saturation), 0.0);
      col = pow(col / 0.18, vec3(contrast)) * 0.18;

      // Fine animated grain, scaled so it never crushes shadows to black.
      float g = hash(vUv * vec2(1483.0, 1031.0)) - 0.5;
      col += g * grainAmount * (0.10 + luma);

      // Vignette.
      col *= 1.0 - vignetteAmount * smoothstep(0.12, 0.55, dist2);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
