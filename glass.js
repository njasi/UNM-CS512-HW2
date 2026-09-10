/**
 * helper file to simulate shattering of 'glass'
 *
 * instead of using a accurate algorithm I think we will do the following
 * - choose a starting 2d range (consider this our initial 'glass' panel)
 * - choose N random points in the range
 * - connect these points randomly
 * - draw lines from the random connections to divide the plane
 * - calculate all the shapes created from these intersections
 *      - iterate through all created lines & check against all the other lines
 *      - need to remember the edges of the bounds count as lines as well
 *      - also only calculate shapes in the range
 *
 * There isn't any guarantee of regularity if we use
 * this setup but it should look broken enough lol
 *
 * Also big bonus here, we dont need 100% correctness and 90% correctness wont even look weird
 */

const TOLERANCE = 0.000001;

class Shard {
  constructor(points, speed, colors = undefined, stationary = false) {
    // float32 arrays for points & colors
    this.points = new Float32Array(points);
    this.stationary = stationary;
    this.debug = false;

    if (!!colors) {
      // use passed colors
      this.colors = colors;
    } else {
      // random color for the entire shape
      let color = [Math.random(), Math.random(), Math.random()];

      this.colors = new Float32Array(this.points.length);
      for (let i = 0; i < this.colors.length; i += 3) {
        this.colors[i] = color[0];
        this.colors[i + 1] = color[1];
        this.colors[i + 2] = color[2];
      }
    }

    // float32 2vec for speed [x,y]
    this.speed = new Float32Array(speed);

    // might be easier to store this as rotation matrix
    this.rotationSpeed = (Math.random() - 0.5) * 5.0;
  }

  /**
   * Update the position based on its existing speed vector
   *
   * move all the points, and update the speed vec
   */
  update(timestep) {
    if (this.stationary) {
      return;
    }
    // update the speed, ie pull it down via gravity
    this.speed[1] -= 9.81 * timestep;

    let dx = (this.speed[0] * timestep) / 10;
    let dy = (this.speed[1] * timestep) / 10;

    let below_screen = true;
    // update position (add speed vec)
    for (let i = 0; i < this.points.length; i += 3) {
      this.points[i] += dx;
      this.points[i + 1] += dy;

      // -1 works as a cuttoff but -2 just in case i want to zoom out later
      below_screen = below_screen && this.points[i + 1] < -2;
    }

    if (below_screen) {
      this.stationary = true;
    }

    // TODO: update rotation (apply rot speed)
  }
}

/**
 * Find the distance between two points
 * @param {(float32, float32)} a
 * @param {(float32, float32)} b
 * @returns
 */
function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Find the intersection point of two lines
 *
 * @param {[(float32, float32), (float32, float32)]} line1
 * @param {[(float32, float32), (float32, float32)]} line2
 *
 * @returns {(float32, float32)}
 */
function lineIntersection(line1, line2, tolerance = TOLERANCE) {
  let [[x1, y1], [x2, y2]] = line1;
  let [[x3, y3], [x4, y4]] = line2;

  const D = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  // stop near dividing by 0
  if (Math.abs(D) < tolerance) {
    return null;
  }

  const x =
    ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / D;
  const y =
    ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / D;
  return [x, y];
}

/**
 * Bound a line inside the rectangle we define
 *
 * @param {[(float32, float32), (float32, float32)]} line   The line
 * @param {float32} x_lim                                   The x limit of the rect
 * @param {float32} y_lim                                   The y lmit of the rect
 *
 * @returns {[(float32, float32), (float32, float32)]}      The clipped line
 */
function clipLineToRectangle(line, x_lim, y_lim, tolerance = TOLERANCE) {
  let [[x1, y1], [x2, y2]] = line;

  const dx = x1 - x2;
  const dy = y1 - y2;

  const possible = [];

  // again stop dividing by near 0
  if (Math.abs(dx) > tolerance) {
    // the left wall & right wall
    possible.push([0, y1 + (-x1 / dx) * dy]);
    possible.push([x_lim, y1 + ((x_lim - x1) / dx) * dy]);
  }
  if (Math.abs(dy) > tolerance) {
    // the top wall & the bottom wall
    possible.push([x1 + (-y1 / dy) * dx, 0]);
    possible.push([x1 + ((y_lim - y1) / dy) * dx, y_lim]);
  }

  // only keep the points that are still in the filter
  const valid = possible.filter((pt, i) => {
    const [x, y] = pt;
    return (
      x >= -tolerance &&
      x <= x_lim + tolerance &&
      y >= -tolerance &&
      y <= y_lim + tolerance
    );
  });

  // ensure we dont get duplicates from hitting corners
  const unique = [];
  for (let i = 0; i < valid.length; i++) {
    const point = valid[i];

    const isDuplicate = unique.some((other) => dist(point, other) <= tolerance);

    if (!isDuplicate) {
      unique.push(point);
    }
  }

  return unique.length >= 2 ? [unique[0], unique[1]] : null;
}

/**
 * Construct adjacency list from line intersection points
 *
 * @param {[[(float32, float32), (float32, float32)]]} lines    The set of lines we want to transform into a graph
 * @param {*} x_lim                                             The x limit of the rect
 * @param {*} y_lim                                             The y limit of the rect
 * @param {*} tolerance                                         Allowable tolerance
 * @returns {[[[int]], [(float32,float32)]]}                    Adjacency list, and the list of verticies with their actual positions
 */
function makeAdjacency(lines, x_lim, y_lim, tolerance = TOLERANCE) {
  // start by adding bounding lines so shards on edges have all the faces needed
  lines.push(
    [
      [0, 0],
      [x_lim, 0],
    ],
    [
      [x_lim, 0],
      [x_lim, y_lim],
    ],
    [
      [x_lim, y_lim],
      [0, y_lim],
    ],
    [
      [0, y_lim],
      [0, 0],
    ],
  );

  const lineBreakdown = lines.map((l) => [[...l[0]], [...l[1]]]);

  // calculate all intersections, ie compare every line to every line
  // add all intersections to the lines array or a copy
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const pt = lineIntersection(lines[i], lines[j]);

      // extra check to ensure within bounds,
      // may be able to reasonably drop this later
      if (
        pt &&
        pt[0] >= -tolerance &&
        pt[0] <= x_lim + tolerance &&
        pt[1] >= -tolerance &&
        pt[1] <= y_lim + tolerance
      ) {
        lineBreakdown[i].push(pt);
        lineBreakdown[j].push(pt);
      }
    }
  }

  // form the multi point lines into segments,
  // which will form the edges on the graph
  const rawEdges = [];
  lineBreakdown.forEach((pts, i) => {
    const [start, end] = lines[i];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];

    pts.sort((a, b) => {
      // make the direction vecs for the two points
      const delta_a = [a[0] - start[0], a[1] - start[1]];
      const delta_b = [b[0] - start[0], b[1] - start[1]];

      // calculate the dot product against the direction vec
      // angles are the same so dist is the only remaining factor
      const dot_a = delta_a[0] * dx + delta_a[1] * dy;
      const dot_b = delta_b[0] * dx + delta_b[1] * dy;

      // larger dot product should mean further away if they are
      // in line with the direction vec
      // could have used standard distance but not sure how id handle
      // if there were points to the left and the right of a position...
      // shouldnt happen here since each line should start at one of the limits
      // of the rectangle but i don't trust that
      return dot_a - dot_b;
    });

    for (let k = 0; k < pts.length - 1; k++) {
      // if the points are not touching add their edge to the list
      // if 3 in a row are "touching" this might break idk
      if (dist(pts[k], pts[k + 1]) >= tolerance) {
        rawEdges.push([pts[k], pts[k + 1]]);
      }
    }
  });

  // helper func to track vertices changes
  // would also remove non unique ones if we missed any in filtering i guess
  const vertices = [];
  const adjacency = [];
  const getVertexIdx = (pt) => {
    // if a point is really close we count it as the same vert
    // should be okkkkk
    // really should have made this differently
    let idx = vertices.findIndex((v) => dist(v, pt) < tolerance);
    if (idx === -1) {
      idx = vertices.length;

      // add the new vert and its list
      vertices.push(pt);
      adjacency.push([]);
    }
    return idx;
  };

  // make the actual adjacency list of intersections
  rawEdges.forEach(([a, b]) => {
    const u = getVertexIdx(a);
    const v = getVertexIdx(b);
    if (u !== v && !adjacency[u].includes(v)) {
      adjacency[u].push(v);
      adjacency[v].push(u);
    }
  });

  return [adjacency, vertices];
}

/**
 * find the faces in a graph from an adjacency list and the real position of vertices
 * ie basically using verticies to ensure the correct planar embedding
 *
 * @param {[[int]]} adjacency               the adjacency list of intersections
 * @param {[(float32,float32)]} vertices    the list of actual intersection coords
 * @param {float32} tolerance               physical tolerance we accept as 0
 *
 * @returns {[[(float32, float32)]]}  A list of the faces found, ie ragged list of list of points
 */
function findFaces(adjacency, vertices, x_lim, y_lim, tolerance = TOLERANCE) {
  // sort adj lsit around each vertex by angle
  const sortedAdj = adjacency.map((neighbors, u) => {
    const u_pt = vertices[u];

    // compare the angles of the segment from each vert to the point u
    return neighbors.slice().sort((v1, v2) => {
      const pt1 = vertices[v1];
      const pt2 = vertices[v2];
      const angle1 = Math.atan2(pt1[1] - u_pt[1], pt1[0] - u_pt[0]);
      const angle2 = Math.atan2(pt2[1] - u_pt[1], pt2[0] - u_pt[0]);
      return angle1 - angle2;
    });
  });

  const faces = [];
  const visitedEdges = new Set();

  // walk the edges via the sorted adj list to find faces
  for (let u = 0; u < vertices.length; u++) {
    for (let v of sortedAdj[u]) {
      let edgeKey = `${u}->${v}`;

      if (visitedEdges.has(edgeKey)) {
        continue;
      }

      const face = [];
      let current = u;
      let next = v;

      while (!visitedEdges.has(edgeKey)) {
        visitedEdges.add(edgeKey);
        face.push(vertices[current]);

        const nextNeighbors = sortedAdj[next];
        const currentIdx = nextNeighbors.indexOf(current);

        // next edge in the face will be the one directly after the current one
        // because of the angle sort
        const nextIdx =
          (currentIdx - 1 + nextNeighbors.length) % nextNeighbors.length;

        // go to the next
        current = next;
        next = nextNeighbors[nextIdx];
        edgeKey = `${current}->${next}`;
      }
      faces.push(face);
    }
  }

  return faces.filter((face) => {
    if (face.length < 3) {
      return false;
    }

    // shoelace area check
    let area = 0;
    for (let i = 0; i < face.length; i++) {
      const p1 = face[i];
      const p2 = face[(i + 1) % face.length];
      area += p1[0] * p2[1] - p2[0] * p1[1];
    }

    const absArea = Math.abs(area) / 2;
    const totalArea = x_lim * y_lim;

    // keep faces that are greater than tolrance, and reject the
    // face thats nearly the same size as the entire surface
    // if i put the shard and starting point count too high
    // this might cause issues, ie discarding N small areas.
    return absArea > tolerance && absArea < totalArea - tolerance;
  });
}

/**
 * Create a list of faces given an area and a shatter origin point
 *
 * @param {float32} x_lim                   The positive X limit of the rectangle
 * @param {float32} y_lim                   The positive Y limit of the rectangle
 * @param {(float32,float32)} shatter_pt    The origin point of the shatter (shards fall away from this)
 * @param {int} n_pts                       The number of points to generate
 * @param {int} connections                 The number of connections per point to make
 *
 * @returns {[[(float32, float32)]]}                       List of shard objects
 */
function shatterFaces(x_lim, y_lim, shatter_pt, n_pts = 5, connections = 1) {
  // TODO:

  // Ensure that connections < n_pts

  // Generate list of random points in the range ie 0,x_lim ; 0, y_lim
  const points = [...Array(n_pts)].map((_) => [
    Math.random() * x_lim,
    Math.random() * y_lim,
  ]);

  // connect the points randomly, create <connections> line per point
  let shatter_lines = [];
  for (let i = 0; i < n_pts; i++) {
    // check with a set and start with i so we dont loop
    let seen = new Set([i]);
    for (let c = 0; c < connections; c++) {
      let j = Math.floor(Math.random() * n_pts);
      while (seen.has(j)) {
        j = (j + 1) % n_pts;
      }
      seen.add(j);
      shatter_lines.push([points[i], points[j]]);
    }
  }

  // TODO: maybe add lines flaring out from shatter_pt to get a free representation of where the
  //       shatter starts

  // calculate all intersections between the lines and the limits
  // NOTE: will all clipped lines still be within the rectangle?
  shatter_lines = shatter_lines
    .map((line) => {
      const clipped = clipLineToRectangle(line, x_lim, y_lim);
      return clipped;
    })
    .filter((line) => !!line);

  // create adjacency list and the list of vertices with actual positions
  const [adjacency, vertices] = makeAdjacency(shatter_lines, x_lim, y_lim);

  // find the faces in the adjacency list, use the actual positions
  // in vertices to make the planar representation
  // TODO: faces seem malformed, must be a bug somewhere i cant find...
  const faces = findFaces(adjacency, vertices, x_lim, y_lim);

  return faces;
}

/**
 * Create a list of Shards given an area and a shatter origin point
 *
 * @param {float32} x_lim                   The positive X limit of the rectangle
 * @param {float32} y_lim                   The positive Y limit of the rectangle
 * @param {(float32,float32)} shatter_pt    The origin point of the shatter (shards fall away from this)
 * @param {int} n_pts                       The number of points to generate
 * @param {int} connections                 The number of connections per point to make
 *
 * @returns {[Shard]}                       List of shard objects
 */
function shatter(
  x_lim,
  y_lim,
  shatter_pt,
  n_pts = 5,
  connections = 1,
  chaos = 4,
) {
  const faces = shatterFaces(x_lim, y_lim, shatter_pt, n_pts, connections);

  return faces.map((face) => {
    // calculate center of shard distance to shatter point
    let cx = 0;
    let cy = 0;
    face.forEach((pt) => {
      cx += pt[0];
      cy += pt[1];
    });
    cx /= face.length;
    cy /= face.length;

    // calculate center dist from shatter to get a explosion effect
    let distance = dist([cx, cy], shatter_pt);
    let vx = cx - shatter_pt[0];
    let vy = cy - shatter_pt[1];

    // TOLERANCE is too small to use here...
    const force = 20.0 + Math.random() * 10.0;
    if (distance > 0.001) {
      vx = (vx / (1 + distance) + (chaos * Math.random() - chaos / 2)) * force;
      vy = (vy / (1 + distance) + (chaos * Math.random() - chaos / 2)) * force;
    }

    // need to turn some faces into triangles
    const triangulatedVertices = [];
    const v0 = face[0];

    // fan triangulation: https://en.wikipedia.org/wiki/Fan_triangulation
    for (let i = 1; i < face.length - 1; i++) {
      let v1 = face[i];
      let v2 = face[i + 1];

      triangulatedVertices.push(
        v0[0] - x_lim / 2,
        v0[1] - y_lim / 2,
        1.0,
        v1[0] - x_lim / 2,
        v1[1] - y_lim / 2,
        1.0,
        v2[0] - x_lim / 2,
        v2[1] - y_lim / 2,
        1.0,
      );
    }
    return new Shard(triangulatedVertices, [vx, vy]);
  });
}
