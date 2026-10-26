/** Original MatCap reflection shader; no reference-site textures or model are reused. */
export const chromeVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
export const chromeFragment = /* glsl */ `
  uniform sampler2D uMatcap;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 eye = normalize(vView);
    vec3 x = normalize(vec3(eye.z, 0.0, -eye.x));
    vec3 y = cross(eye, x);
    vec2 uv = vec2(dot(x, n), dot(y, n)) * .485 + .5;
    uv.x += sin(uTime * .65) * .018;
    vec3 reflection = texture2D(uMatcap, uv).rgb;
    float rim = pow(1.0 - abs(dot(n, eye)), 3.0);
    vec3 color = reflection * 1.08 + vec3(.17) * rim;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
export const steamVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`;
export const steamFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float bend = sin(vUv.y * 9.0 - uTime * 2.4) * .10;
    float width = .04 + vUv.y * .10;
    float ribbon = exp(-pow((vUv.x - .5 - bend) / width, 2.0));
    float fade = sin(vUv.y * 3.14159) * (1.0 - vUv.y);
    gl_FragColor = vec4(.50,.48,.45,ribbon*fade*uOpacity);
  }
`;
