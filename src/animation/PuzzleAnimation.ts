import AbstractAnimation, { Options } from './AbstractAnimation';
import Node from '../node/Node';
import TextureCache from '../refresh/TextureCache';
import { identity, multiplyRef, multiplyRotateX, multiplyRotateY, multiplyRotateZ } from '../math/matrix';
import { d2r, H } from '../math/geom';
import { calMatrixByOrigin, calPerspectiveMatrix } from '../style/transform';
import { bindTexture, createTexture, drawMask, drawTextureCache, texture2Blob } from '../gl/webgl';
import { genFrameBufferWithTexture, releaseFrameBuffer } from '../refresh/fb';
import inject from '../util/inject';
import { canvasPolygon } from '../refresh/paint';
import CacheProgram from '../gl/CacheProgram';

class PuzzleAnimation extends AbstractAnimation {
  hook: (gl: WebGL2RenderingContext | WebGLRenderingContext) => void;
  textureCache?: TextureCache;

  constructor(node: Node, options: Options) {
    super(node, options);
    this.hook = (gl: WebGL2RenderingContext | WebGLRenderingContext) => {
      this.exec(gl);
    };
    node.hookList.push(this.hook);
  }

  onRunning(delta: number, old?: number) {
    super.onRunning(delta, old);
  }

  exec(gl: WebGL2RenderingContext | WebGLRenderingContext) {
    const { textureTarget, computedStyle } = this.node;
    // 暂时只支持小尺寸
    if (textureTarget?.available && textureTarget.list.length === 1) {
      // 首次生成拼图样子，如果依赖的tex更新了也要重新生成
      if (this.textureCache !== textureTarget) {
        this.textureCache = this.genTextureCache(gl, textureTarget);
      }
      // const transformOrigin = computedStyle.transformOrigin;
      // const bbox = textureTarget?.bbox;
      // const perspective = 1000;
      // const matrix = identity();
      // multiplyRotateX(matrix, d2r(10));
      // multiplyRotateY(matrix, d2r(20));
      // multiplyRotateZ(matrix, d2r(20));
      // const m = calMatrixByOrigin(matrix, transformOrigin[0], transformOrigin[1]);
      // const p = calPerspectiveMatrix(perspective, bbox[2] - bbox[0], bbox[3] - bbox[1]);
      // multiplyRef(p, m);
      // const temp = TextureCache.getEmptyInstance(gl, textureTarget.bbox);
      // temp.available = true;
      // let frameBuffer: WebGLFramebuffer | undefined;
      // const root = this.node.root!;
      // const main = root.programs.main;
      // textureTarget.list.forEach(item => {
      //   const { w, h, t, bbox } = item;
      //   const tex = createTexture(gl, 0, undefined, w, h);
      //   console.log(w, h)
      //   if (frameBuffer) {
      //     gl.framebufferTexture2D(
      //       gl.FRAMEBUFFER,
      //       gl.COLOR_ATTACHMENT0,
      //       gl.TEXTURE_2D,
      //       tex,
      //       0,
      //     );
      //     gl.viewport(0, 0, w, h);
      //   }
      //   else {
      //     frameBuffer = genFrameBufferWithTexture(gl, tex, w, h);
      //   }
      //   // bindTexture(gl, t, 0);
      //   drawTextureCache(gl, w * 0.5, h * 0.5, main, {
      //     opacity: 1,
      //     matrix: m,
      //     bbox,
      //     t,
      //   });
      //   temp.list.push({
      //     bbox: bbox.slice(0),
      //     w,
      //     h,
      //     t: tex,
      //   });
      //   texture2Blob(gl, w, h);
      // });
      // releaseFrameBuffer(gl, frameBuffer!, root.width, root.height);
    }
  }

  genTextureCache(gl: WebGL2RenderingContext | WebGLRenderingContext, textureTarget: TextureCache) {
    const root = this.node.root!;
    const { main, mask } = root!.programs;
    const bbox = textureTarget.bbox;
    // 可能是图视频，w/h不匹配重新算
    const w = bbox[2] - bbox[0];
    const h = bbox[3] - bbox[1];
    // 分成4块，中间线为界，但因为拼图关系向两边扩充一点，互相有重合，后面用mask挖洞
    const shapes = genPuzzleCoords(w, h);
    // const canvas1 = inject.getOffscreenCanvas(shapes[0].width, shapes[0].height);
    // const canvas2 = inject.getOffscreenCanvas(shapes[1].width, shapes[1].height);
    // const canvas3 = inject.getOffscreenCanvas(x2, h - y1);
    // const canvas4 = inject.getOffscreenCanvas(w - x1, h - y1);
    const res = TextureCache.getEmptyInstance(gl, textureTarget.bbox);
    res.available = true;
    let frameBuffer: WebGLFramebuffer | undefined;
    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i];
      const canvas = inject.getOffscreenCanvas(shape.width, shape.height);
      canvas.ctx.fillStyle = '#FFF';
      canvas.ctx.beginPath();
      canvasPolygon(canvas.ctx, shape.coords);
      canvas.ctx.closePath();
      canvas.ctx.fill();
      const tex1 = createTexture(gl, 0, canvas.canvas);
      const tex2 = createTexture(gl, 0, undefined, shape.width, shape.height);
      CacheProgram.useProgram(gl, main);
      if (frameBuffer) {
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          tex2,
          0,
        );
        gl.viewport(0, 0, shape.width, shape.height);
      }
      else {
        frameBuffer = genFrameBufferWithTexture(gl, tex2, shape.width, shape.height);
      }
      drawTextureCache(gl, shape.width * 0.5, shape.height * 0.5, main, {
        opacity: 1,
        bbox: new Float32Array([0, 0, shape.width, shape.height]),
        t: textureTarget.list[0].t,
        tc: shape.tc,
      });
      CacheProgram.useProgram(gl, mask);
      const tex3 = createTexture(gl, 0, undefined, shape.width, shape.height);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        tex3,
        0,
      );
      drawMask(gl, mask, tex1, tex2);
      gl.deleteTexture(tex1);
      gl.deleteTexture(tex2);
      res.list.push({
        bbox: shape.bbox,
        w: shape.width,
        h: shape.height,
        t: tex3,
      });
      canvas.release();
      texture2Blob(gl, shape.width, shape.height);
    }
    releaseFrameBuffer(gl, frameBuffer!, root.width, root.height);
    CacheProgram.useProgram(gl, main);
    return res;
  }

  onFirstInDelay() {
  }

  onFirstInEndDelay() {}

  onChangePlayCount() {}
}

function genPuzzleCoords(w: number, h: number) {
  const r = Math.floor(Math.min(w, h) * 0.1);
  const d = r * 2;
  const xm = Math.round(w * 0.5);
  const ym = Math.round(h * 0.5);
  const w2 = w - xm + r;
  const w3 = w - xm;
  const h3 = h - ym + r;
  const w4 = xm + r;
  const h4 = h - ym;
  // 分成4块
  return [
    {
      bbox: new Float32Array([0, 0, xm, ym + r]),
      width: xm,
      height: ym + r,
      coords: [
        [0, 0],
        [xm, 0],
        [xm, (ym - d) * 0.5 + r * 0.5],
        // [xm - r, (ym - d) * 0.5 + r],
        [xm - r * H, (ym - d) * 0.5, xm - r, (ym - d) * 0.5 + r - H * r, xm - r, (ym - d) * 0.5 + r],
        // [xm, (ym - d) * 0.5 + d],
        [xm - r, (ym - d) * 0.5 + r + r * H, xm - r * H, (ym - d) * 0.5 + d, xm, (ym - d) * 0.5 + d - r * 0.5],
        [xm, ym],
        [(xm - d) * 0.5 + d - r * 0.5, ym],
        // [(xm - d) * 0.5 + r, ym + r],
        [(xm - d) * 0.5 + d, ym + r * H, (xm - d) * 0.5 + r + r * H, ym + r, (xm - d) * 0.5 + r, ym + r],
        // [(xm - d) * 0.5, ym],
        [(xm - d) * 0.5 + r - r * H, ym + r, (xm - d) * 0.5, ym + r - r * H, (xm - d) * 0.5 + r * 0.5, ym],
        [0, ym],
        [0, 0],
      ],
      tc: {
        x1: 0,
        y1: 1 - (ym + r) / h,
        x3: xm / w,
        y3: 1,
      },
    },
    {
      bbox: new Float32Array([xm - r, 0, w, ym]),
      width: w2,
      height: ym,
      coords: [
        [r, 0],
        [w2, 0],
        [w2, ym],
        [(w2 - r - d) * 0.5 + r * 0.5 + d, ym],
        // [(w2 - r - d) * 0.5 + d, ym - r],
        [(w2 - r - d) * 0.5 + r + d, ym - r * H, (w2 - r - d) * 0.5 + d + r * H, ym - r, (w2 - r - d) * 0.5 + d, ym - r],
        // [(w2 - r - d) * 0.5 + r, ym],
        [(w2 - r - d) * 0.5 + d - r * H, ym - r, (w2 - r - d) * 0.5 + r, ym - r * H, (w2 - r - d) * 0.5 + r * 1.5, ym],
        [r, ym],
        [r, (ym - d) * 0.5 + d - r * 0.5],
        // [0, (ym - d) * 0.5 + r],
        [r - r * H, (ym - d) * 0.5 + d, 0, (ym - d) * 0.5 + r + r * H, 0, (ym - d) * 0.5 + r],
        // [r, (ym - d) * 0.5],
        [0, (ym - d) * 0.5 + r - r * H, r - r * H, (ym - d) * 0.5, r, (ym - d) * 0.5 + r * 0.5],
        [r, 0],
      ],
      tc: {
        x1: (xm - r) / w,
        y1: 1 - ym / h,
        x3: 1,
        y3: 1,
      },
    },
    {
      bbox: new Float32Array([xm, ym - r, w, h]),
      width: w3,
      height: h3,
      coords: [
        [0, r],
        [(w3 - d) * 0.5 + r * 0.5, r],
        // [(w3 - d) * 0.5 + r, 0],
        [(w3 - d) * 0.5, r - r * H, (w3 - d) * 0.5 + r - r * H, 0, (w3 - d) * 0.5 + r, 0],
        // [(w3 - d) * 0.5 + d, r],
        [(w3 - d) * 0.5 + r + r * H, 0, (w3 - d) * 0.5 + d, r - r * H, (w3 - d) * 0.5 + d - r * 0.5, r],
        [w3, r],
        [w3, h3],
        [0, h3],
        [0, (h3 - r - d) * 0.5 + r + d - r * 0.5],
        // [r, (h3 - r - d) * 0.5 + d],
        [r * H, (h3 - r - d) * 0.5 + r + d, r, (h3 - r - d) * 0.5 + d + r * H, r, (h3 - r - d) * 0.5 + d],
        // [0, (h3 - r - d) * 0.5 + r],
        [r, (h3 - r - d) * 0.5 + d - r * H, r * H, (h3 - r - d) * 0.5 + r, 0, (h3 - r - d) * 0.5 + r * 1.5],
        [0, r],
      ],
      tc: {
        x1: xm / w,
        y1: 0,
        x3: 1,
        y3: 1 - (ym - r) / h,
      },
    },
    {
      bbox: new Float32Array([0, ym - r, w4, h]),
      width: w4,
      height: h4,
      coords: [
        [0, 0],
        [(w4 - r - d) * 0.5 + r * 0.5, 0],
        // [(w4 - r - d) * 0.5 + r, r],
        [(w4 - r - d) * 0.5, r * H, (w4 - r - d) * 0.5 + r - r * H, r, (w4 - r - d) * 0.5 + r, r],
        // [(w4 - r - d) * 0.5 + d, 0],
        [(w4 - r - d) * 0.5 + r + r * H, r, (w4 - r - d) * 0.5 + d, r * H, (w4 - r - d) * 0.5 + d - r * 0.5, 0],
        [w4 - r, 0],
        [w4 - r, (h4 - d) * 0.5 + r * 0.5],
        // [w4, (h4 - d) * 0.5 + r],
        [w4 - r + r * H, (h4 - d) * 0.5, w4, (h4 - d) * 0.5 + r - r * H, w4, (h4 - d) * 0.5 + r],
        // [w4 - r, (h4 - d) * 0.5 + d],
        [w4, (h4 - d) * 0.5 + r + r * H, w4 - r + r * H, (h4 - d) * 0.5 + d, w4 - r, (h4 - d) * 0.5 + d - r * 0.5],
        [w4 - r, h4],
        [0, h4],
        [0, 0],
      ],
      tc: {
        x1: 0,
        y1: 0,
        x3: (xm + r) / w,
        y3: ym / h,
      },
    },
  ];
}

export default PuzzleAnimation;
