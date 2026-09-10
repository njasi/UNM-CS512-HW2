#version 300 es

in vec3 aPosition;
in vec3 aColor;

uniform float uTime; // time in sec
out vec3 vColor;

// create a 2d scaling matrix
mat3 scaling2D(float xs, float ys){
  return mat3(
    xs , 0.0, 0.0,
    0.0,  ys, 0.0,
    0.0, 0.0, 1.0
  );
}

// create a 2d rotation matrix
mat3 rotate2D(float angle){
  return mat3(
    cos(angle)        , sin(angle), 0.0,
    -1.0 * sin(angle) , cos(angle), 0.0,
    0.0               , 0.0       , 1.0
  );
}

// create a 2d shear matrix
// to shear in only x/y leave the other param = 0
mat3 shear2D(float xs, float ys){
  return mat3(
    1.0, ys , 0.0,
    xs , 1.0, 0.0,
    0.0, 0.0, 1.0
  );
}

// create a 2d mirror matrix
// to mirror across X angle = 1/2 pi rad, 3/2 pi rad etc
// to mirror across Y angle = 0 rad, pi rad etc
mat3 mirror2D(float angle){
  return mat3(
    cos(2.0 * angle), sin(2.0 * angle)        , 0.0,
    sin(2.0 * angle), -1.0 * cos(2.0 * angle) , 0.0,
    0.0             , 0.0                     , 1.0
  );
}

// create a 2d translation matrix
mat3 translate2D(float tx, float ty){
  return mat3(
    1.0, 0.0, 0.0 ,
    0.0, 1.0, 0.0 ,
    tx , ty , 1.0
  );
}

void main() {
  // we don't want to alter the actual position
  vec3 pos = aPosition;

  if (uTime < 3.0) {
    // scale to make actions more violent right before shattering
    float scale = (uTime / 2.0);

    // translate with sin & cos for a shake in xy
    float t_x = sin(uTime * 40.0 * (scale + 0.5)) * 0.01 * scale;
    float t_y = cos(uTime * 30.0 * (scale + 0.5)) * 0.01 * scale;
    mat3 T = translate2D(t_x, t_y);

    // change scale with sin like a z shake
    float resizeAmount = 1.0 + sin(uTime * 20.0 * (scale + 0.5)) * 0.03 * scale;
    mat3 S = scaling2D(resizeAmount, resizeAmount);

    // NOTE: reimplemented scaling with the matrix
    mat3 M = T * S;
    pos = M * pos;
  }

  // drop the z=1 for the 2d shader 
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  vColor = aColor;
}