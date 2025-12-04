#ifdef GL_ES
precision mediump float;
#endif

varying vec2 v_texCoords;
uniform sampler2D u_texture;
uniform int u_kernel;
uniform vec2 u_velocity;
uniform vec2 u_offset;

const int MAX_KERNEL_SIZE = 2048;

void main(void) {
  vec4 color = texture2D(u_texture, v_texCoords + u_offset);
  for (int i = 1; i < MAX_KERNEL_SIZE - 1; i++) {
    if (i >= u_kernel) {
      break;
    }
    vec2 bias = u_velocity * (float(i) / float(u_kernel));
    color += texture2D(u_texture, v_texCoords + bias + u_offset) * 0.5;
    color += texture2D(u_texture, v_texCoords - bias + u_offset) * 0.5;
  }
  gl_FragColor = color / float(u_kernel);
}
