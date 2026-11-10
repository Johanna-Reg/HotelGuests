/**
 * A small WebGL renderer for the ad: lit, textured static meshes (the room) and one skinned mesh
 * (Elric). Static geometry is built once in world space; only uniforms change per frame.
 */
export type Mat4 = Float32Array;

export const m4 = {
  identity(): Mat4 {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },
  mul(a: ArrayLike<number>, b: ArrayLike<number>, out: Mat4 = new Float32Array(16)): Mat4 {
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
        out[c * 4 + r] = s;
      }
    return out;
  },
  ortho(l: number, r: number, b: number, t: number, n: number, f: number): Mat4 {
    const m = m4.identity();
    m[0] = 2 / (r - l);
    m[5] = 2 / (t - b);
    m[10] = -2 / (f - n);
    m[12] = -(r + l) / (r - l);
    m[13] = -(t + b) / (t - b);
    m[14] = -(f + n) / (f - n);
    return m;
  },
  lookAt(eye: number[], at: number[], up: number[]): Mat4 {
    const z = norm([eye[0]! - at[0]!, eye[1]! - at[1]!, eye[2]! - at[2]!]);
    const x = norm(cross(up, z));
    const y = cross(z, x);
    const m = m4.identity();
    m[0] = x[0]!; m[4] = x[1]!; m[8] = x[2]!;
    m[1] = y[0]!; m[5] = y[1]!; m[9] = y[2]!;
    m[2] = z[0]!; m[6] = z[1]!; m[10] = z[2]!;
    m[12] = -dot(x, eye); m[13] = -dot(y, eye); m[14] = -dot(z, eye);
    return m;
  },
  /** Translation, rotation about Y, uniform scale. */
  trs(tx: number, ty: number, tz: number, yaw = 0, s = 1, sy = s): Mat4 {
    const c = Math.cos(yaw) * s;
    const n = Math.sin(yaw) * s;
    const m = m4.identity();
    m[0] = c; m[2] = -n;
    m[5] = sy;
    m[8] = n; m[10] = c;
    m[12] = tx; m[13] = ty; m[14] = tz;
    return m;
  },
  /** Rotation from a quaternion, then scale, then translation. */
  fromQuat(q: ArrayLike<number>, s: number, t: ArrayLike<number>, out: Mat4 = new Float32Array(16)): Mat4 {
    const [x, y, z, w] = [q[0]!, q[1]!, q[2]!, q[3]!];
    out[0] = (1 - 2 * (y * y + z * z)) * s; out[1] = 2 * (x * y + z * w) * s; out[2] = 2 * (x * z - y * w) * s; out[3] = 0;
    out[4] = 2 * (x * y - z * w) * s; out[5] = (1 - 2 * (x * x + z * z)) * s; out[6] = 2 * (y * z + x * w) * s; out[7] = 0;
    out[8] = 2 * (x * z + y * w) * s; out[9] = 2 * (y * z - x * w) * s; out[10] = (1 - 2 * (x * x + y * y)) * s; out[11] = 0;
    out[12] = t[0]!; out[13] = t[1]!; out[14] = t[2]!; out[15] = 1;
    return out;
  },
  apply(m: ArrayLike<number>, p: number[]): [number, number, number, number] {
    const [x, y, z] = [p[0]!, p[1]!, p[2]!];
    return [
      m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
      m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
      m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
      m[3]! * x + m[7]! * y + m[11]! * z + m[15]!,
    ];
  },
};

function cross(a: number[], b: number[]) {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}
function dot(a: number[], b: number[]) {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}
function norm(a: number[]) {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1;
  return [a[0]! / l, a[1]! / l, a[2]! / l];
}

/** Interleaved geometry under construction: position, normal, uv, colour. */
export class MeshBuilder {
  data: number[] = [];
  idx: number[] = [];
  private get count() {
    return this.data.length / 11;
  }
  vert(p: number[], n: number[], uv: number[], c: number[]) {
    this.data.push(p[0]!, p[1]!, p[2]!, n[0]!, n[1]!, n[2]!, uv[0]!, uv[1]!, c[0]!, c[1]!, c[2]!);
  }
  /** A quad from four corners (counter-clockwise seen from the front) with one normal. */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], uv: number[][], col: number[], ao = [1, 1, 1, 1]) {
    const base = this.count;
    [a, b, c, d].forEach((p, i) => this.vert(p, n, uv[i]!, col.map((v) => v * ao[i]!)));
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /**
   * An axis-aligned box. `uvScale` > 0 maps world units to texture repeats per face (for tiled
   * stone or planks); 0 leaves the faces at the texture's white corner. Floor-level vertices are
   * darkened a little for contact shading. `skip` drops faces nobody sees.
   */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number[], uvScale = 0, skip = '') {
    const ao = (y: number) => (y <= 0.001 ? 0.72 : 1);
    const u = (a: number, b: number) => (uvScale ? [a * uvScale, b * uvScale] : [0.002, 0.002]);
    const C = col;
    // +X
    if (!skip.includes('px')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [u(z1, y0), u(z0, y0), u(z0, y1), u(z1, y1)], C.map((v) => v * 0.82), [ao(y0), ao(y0), 1, 1]);
    // -X
    if (!skip.includes('nx')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [u(z0, y0), u(z1, y0), u(z1, y1), u(z0, y1)], C.map((v) => v * 0.82), [ao(y0), ao(y0), 1, 1]);
    // +Y (top)
    if (!skip.includes('py')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [u(x0, z1), u(x1, z1), u(x1, z0), u(x0, z0)], C);
    // +Z
    if (!skip.includes('pz')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [u(x0, y0), u(x1, y0), u(x1, y1), u(x0, y1)], C.map((v) => v * 0.92), [ao(y0), ao(y0), 1, 1]);
    // -Z
    if (!skip.includes('nz')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [u(x1, y0), u(x0, y0), u(x0, y1), u(x1, y1)], C.map((v) => v * 0.92), [ao(y0), ao(y0), 1, 1]);
  }
  /** A box turned about Y by `yaw` around its own centre, then tilted about X by `tilt`. */
  rotBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw: number, tilt: number, col: number[]) {
    const tmp = new MeshBuilder();
    tmp.box(-sx / 2, -sy / 2, -sz / 2, sx / 2, sy / 2, sz / 2, col);
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    const rot = (x: number, y: number, z: number) => {
      const y1 = y * ct - z * st;
      const z1 = y * st + z * ct;
      return [x * cyw + z1 * syw, y1, -x * syw + z1 * cyw];
    };
    const base = this.count;
    for (let i = 0; i < tmp.data.length; i += 11) {
      const p = rot(tmp.data[i]!, tmp.data[i + 1]!, tmp.data[i + 2]!);
      const n = rot(tmp.data[i + 3]!, tmp.data[i + 4]!, tmp.data[i + 5]!);
      this.vert([p[0]! + cx, p[1]! + cy, p[2]! + cz], n, [tmp.data[i + 6]!, tmp.data[i + 7]!], [tmp.data[i + 8]!, tmp.data[i + 9]!, tmp.data[i + 10]!]);
    }
    for (const k of tmp.idx) this.idx.push(base + k);
  }
  /** A cylinder along Y. */
  cylinder(cx: number, y0: number, cz: number, r: number, h: number, col: number[], seg = 10) {
    const base = this.count;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const n = [Math.cos(a), 0, Math.sin(a)];
      this.vert([cx + n[0]! * r, y0, cz + n[2]! * r], n, [0.002, 0.002], col.map((v) => v * 0.8));
      this.vert([cx + n[0]! * r, y0 + h, cz + n[2]! * r], n, [0.002, 0.002], col);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    const top = this.count;
    this.vert([cx, y0 + h, cz], [0, 1, 0], [0.002, 0.002], col);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      this.vert([cx + Math.cos(a) * r, y0 + h, cz + Math.sin(a) * r], [0, 1, 0], [0.002, 0.002], col);
    }
    for (let i = 0; i < seg; i++) this.idx.push(top, top + 2 + i, top + 1 + i);
  }
}

export interface GpuMesh {
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  count: number;
  tex: WebGLTexture;
}

const STATIC_VS = `
attribute vec3 a_pos; attribute vec3 a_nrm; attribute vec2 a_uv; attribute vec3 a_col;
uniform mat4 u_vp; uniform mat4 u_model;
varying vec3 v_nrm; varying vec2 v_uv; varying vec3 v_col; varying vec3 v_world;
void main(){ vec4 w = u_model * vec4(a_pos,1.0); v_world = w.xyz; v_nrm = mat3(u_model) * a_nrm; v_uv = a_uv; v_col = a_col; gl_Position = u_vp * w; }`;

const SKIN_VS = `
attribute vec3 a_pos; attribute vec3 a_nrm; attribute vec2 a_uv; attribute vec4 a_joint; attribute vec4 a_weight;
uniform mat4 u_vp; uniform mat4 u_model; uniform mat4 u_bones[21];
varying vec3 v_nrm; varying vec2 v_uv; varying vec3 v_col; varying vec3 v_world;
void main(){
  mat4 s = u_bones[int(a_joint.x)] * a_weight.x + u_bones[int(a_joint.y)] * a_weight.y + u_bones[int(a_joint.z)] * a_weight.z + u_bones[int(a_joint.w)] * a_weight.w;
  vec4 w = u_model * s * vec4(a_pos,1.0); v_world = w.xyz; v_nrm = mat3(u_model) * mat3(s) * a_nrm; v_uv = a_uv; v_col = vec3(1.0); gl_Position = u_vp * w; }`;

const FS = `
precision mediump float;
varying vec3 v_nrm; varying vec2 v_uv; varying vec3 v_col; varying vec3 v_world;
uniform sampler2D u_tex; uniform vec3 u_light; uniform vec3 u_lightCol; uniform vec3 u_ambSky; uniform vec3 u_ambGround;
uniform vec3 u_lamp; uniform vec3 u_lampCol; uniform float u_alpha; uniform vec3 u_tint; uniform vec3 u_emit; uniform float u_unlit;
void main(){
  vec3 n = normalize(v_nrm);
  vec4 t = texture2D(u_tex, v_uv);
  vec3 base = t.rgb * v_col * u_tint;
  float d = max(dot(n, normalize(u_light)), 0.0);
  vec3 amb = mix(u_ambGround, u_ambSky, n.y * 0.5 + 0.5);
  vec3 L = u_lamp - v_world; float dist = length(L);
  float lamp = max(dot(n, L / dist), 0.0) * 0.6 + 0.4;
  lamp *= 1.0 / (1.0 + dist * dist * 0.18);
  vec3 c = mix(base * (amb + u_lightCol * d + u_lampCol * lamp), base, u_unlit) + u_emit;
  if (t.a * u_alpha < 0.02) discard;
  gl_FragColor = vec4(c, t.a * u_alpha);
}`;

export interface Lights {
  dir: number[];
  dirCol: number[];
  sky: number[];
  ground: number[];
  lamp: number[];
  lampCol: number[];
}

export class Renderer {
  gl: WebGLRenderingContext;
  canvas: HTMLCanvasElement;
  private progStatic: WebGLProgram;
  private progSkin: WebGLProgram;
  white: WebGLTexture;
  vp: Mat4 = m4.identity();

  constructor(w: number, h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    const gl = this.canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false })!;
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    this.progStatic = this.program(STATIC_VS, FS);
    this.progSkin = this.program(SKIN_VS, FS);
    this.white = this.texture(null);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  private program(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    return p;
  }

  texture(src: TexImageSource | null, repeat = false): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (src) {
      // WebGL 1 only mipmaps and repeats power-of-two textures: resample anything else.
      const w = (src as { width: number }).width;
      const h = (src as { height: number }).height;
      const pot = (n: number) => 2 ** Math.round(Math.log2(n));
      if (w !== pot(w) || h !== pot(h)) {
        const cv = document.createElement('canvas');
        cv.width = pot(w);
        cv.height = pot(h);
        cv.getContext('2d')!.drawImage(src as CanvasImageSource, 0, 0, cv.width, cv.height);
        src = cv;
      }
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  upload(b: MeshBuilder, tex?: WebGLTexture): GpuMesh {
    const gl = this.gl;
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(b.data), gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(b.idx), gl.STATIC_DRAW);
    return { vbo, ibo, count: b.idx.length, tex: tex ?? this.white };
  }

  begin(w: number, h: number) {
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  private uniforms(p: WebGLProgram, model: Mat4, lights: Lights, alpha: number, tint: number[], emit: number[]) {
    const gl = this.gl;
    const u = (n: string) => gl.getUniformLocation(p, n);
    gl.uniformMatrix4fv(u('u_vp'), false, this.vp);
    gl.uniformMatrix4fv(u('u_model'), false, model);
    gl.uniform3fv(u('u_light'), lights.dir);
    gl.uniform3fv(u('u_lightCol'), lights.dirCol);
    gl.uniform3fv(u('u_ambSky'), lights.sky);
    gl.uniform3fv(u('u_ambGround'), lights.ground);
    gl.uniform3fv(u('u_lamp'), lights.lamp);
    gl.uniform3fv(u('u_lampCol'), lights.lampCol);
    gl.uniform1f(u('u_alpha'), alpha);
    gl.uniform3fv(u('u_tint'), tint);
    gl.uniform3fv(u('u_emit'), emit);
    gl.uniform1i(u('u_tex'), 0);
  }

  draw(m: GpuMesh, model: Mat4, lights: Lights, o: { alpha?: number; tint?: number[]; emit?: number[]; unlit?: number } = {}) {
    const gl = this.gl;
    const p = this.progStatic;
    gl.useProgram(p);
    const alpha = o.alpha ?? 1;
    if (alpha < 1) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
    }
    this.uniforms(p, model, lights, alpha, o.tint ?? [1, 1, 1], o.emit ?? [0, 0, 0]);
    gl.uniform1f(gl.getUniformLocation(p, 'u_unlit'), o.unlit ?? 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, m.tex);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
    const at = (n: string) => gl.getAttribLocation(p, n);
    const bind = (n: string, size: number, off: number) => {
      const a = at(n);
      if (a < 0) return;
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, size, gl.FLOAT, false, 44, off);
    };
    bind('a_pos', 3, 0);
    bind('a_nrm', 3, 12);
    bind('a_uv', 2, 24);
    bind('a_col', 3, 32);
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
    if (alpha < 1) {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
    }
  }

  skinned(s: SkinnedGpu, model: Mat4, bones: Float32Array, lights: Lights) {
    const gl = this.gl;
    const p = this.progSkin;
    gl.useProgram(p);
    this.uniforms(p, model, lights, 1, [1, 1, 1], [0, 0, 0]);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'u_bones'), false, bones);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s.tex);
    gl.disable(gl.CULL_FACE);
    for (const part of s.parts) {
      const bind = (n: string, buf: WebGLBuffer, size: number) => {
        const a = gl.getAttribLocation(p, n);
        if (a < 0) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, size, gl.FLOAT, false, 0, 0);
      };
      bind('a_pos', part.pos, 3);
      bind('a_nrm', part.nrm, 3);
      bind('a_uv', part.uv, 2);
      bind('a_joint', part.joint, 4);
      bind('a_weight', part.weight, 4);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.ibo);
      gl.drawElements(gl.TRIANGLES, part.count, part.u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    }
    gl.enable(gl.CULL_FACE);
    // The skinned program's extra attributes must not stay enabled for the static one.
    for (const n of ['a_joint', 'a_weight']) {
      const a = gl.getAttribLocation(p, n);
      if (a >= 0) gl.disableVertexAttribArray(a);
    }
  }
}

export interface SkinnedGpu {
  tex: WebGLTexture;
  parts: { pos: WebGLBuffer; nrm: WebGLBuffer; uv: WebGLBuffer; joint: WebGLBuffer; weight: WebGLBuffer; ibo: WebGLBuffer; count: number; u32: boolean }[];
}
