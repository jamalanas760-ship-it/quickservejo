/** Full-screen atmospheric reveal, inspired by the reference's cloud-to-dark transition. */
export const atmosphereVertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}`;
export const atmosphereFragment = `
varying vec2 vUv;uniform float uTime;uniform float uNight;uniform float uFlash;uniform float uAspect;
float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float a=.5,n=0.;for(int i=0;i<3;i++){n+=noise(p)*a;p=p*2.06+vec2(3.4,1.7);a*=.5;}return n;}
void main(){vec2 p=(vUv-.5)*vec2(uAspect,1.);float t=uTime*.075;
float n=fbm(p*3.5+vec2(t,-t));float detail=fbm(p*6.+vec2(n*.9,-t));
vec3 light=mix(vec3(.73,.77,.77),vec3(1.,.96,.84),smoothstep(.2,.8,n));
vec3 dark=mix(vec3(.012,.025,.055),vec3(.055,.075,.11),detail*.65);
float halo=exp(-length(p-vec2(0.,.12))*3.3);
vec3 color=mix(light,dark,uNight)+vec3(1.,.65,.26)*halo*(.03+uFlash*.75);
float beam=pow(max(0.,1.-abs(p.x+sin(p.y*2.+uTime*.1)*.07)*4.),8.);
color+=vec3(1.,.87,.57)*beam*uFlash*.5;
color*=1.-smoothstep(.25,1.5,length(p))*.25;
gl_FragColor=vec4(color,1.);}`;
export const sparkFragment = `void main(){float d=length(gl_PointCoord-.5);float a=pow(max(0.,1.-d*2.),2.);gl_FragColor=vec4(1.,.75,.36,a*.8);}`;
