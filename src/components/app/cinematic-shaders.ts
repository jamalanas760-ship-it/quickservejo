/** Small procedural overlays; all photographic detail stays in compressed local assets. */
export const screenVertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<3;i++){s+=a*noise(p);p=p*2.1+vec2(4.3,1.7);a*=.5;}return s;}`;
export const steamFragment = `
varying vec2 vUv;uniform float uTime;uniform float uReveal;${noise}
void main(){vec2 p=vUv;float drift=sin(p.y*7.-uTime*1.1)*.15;
float cloud=fbm(vec2((p.x+drift)*5.,p.y*4.-uTime*.7));
float edge=pow(max(0.,sin(p.x*3.14159)),1.8)*smoothstep(0.,.12,p.y)*pow(1.-p.y,1.2);
float a=smoothstep(.14,.65,cloud)*edge*uReveal*.65;
gl_FragColor=vec4(1.,.86,.68,a);}`;
export const flameFragment = `
varying vec2 vUv;uniform float uTime;${noise}
void main(){vec2 p=vUv;float n=fbm(vec2(p.x*6.,p.y*4.-uTime*2.));
float shape=pow(max(0.,sin(p.x*3.14159)),1.5)*pow(1.-p.y,1.7);
float a=smoothstep(.1,.55,n*shape)*smoothstep(0.,.1,p.y)*.28;
gl_FragColor=vec4(1.,.3+.4*n,.04,a);}`;
export const particleFragment = `void main(){float d=length(gl_PointCoord-.5);float a=pow(max(0.,1.-d*2.),2.);gl_FragColor=vec4(1.,.65,.25,a*.65);}`;
