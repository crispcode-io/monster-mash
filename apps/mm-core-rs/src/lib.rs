use core::slice;
use std::alloc::{alloc, dealloc, Layout};

#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MeshStats {
    pub quads: u32,
    pub vertices: u32,
    pub indices: u32,
}

impl MeshStats {
    pub fn from_quads(quads: u32) -> Self {
        let vertices = quads.saturating_mul(4);
        let indices = quads.saturating_mul(6);
        Self {
            quads,
            vertices,
            indices,
        }
    }
}

struct MeshBuffers {
    positions: Vec<f32>,
    normals: Vec<f32>,
    uvs: Vec<f32>,
    indices: Vec<u32>,
}

#[derive(Clone, Copy)]
struct Face {
    normal: [f32; 3],
    corners: [[f32; 3]; 4],
}

const UVS: [f32; 8] = [0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0];

const FACES: [Face; 6] = [
    Face {
        normal: [-1.0, 0.0, 0.0],
        corners: [
            [0.0, 0.0, 1.0],
            [0.0, 1.0, 1.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0],
        ],
    },
    Face {
        normal: [1.0, 0.0, 0.0],
        corners: [
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [1.0, 1.0, 1.0],
            [1.0, 0.0, 1.0],
        ],
    },
    Face {
        normal: [0.0, -1.0, 0.0],
        corners: [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, 0.0, 1.0],
            [0.0, 0.0, 1.0],
        ],
    },
    Face {
        normal: [0.0, 1.0, 0.0],
        corners: [
            [0.0, 1.0, 1.0],
            [1.0, 1.0, 1.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
        ],
    },
    Face {
        normal: [0.0, 0.0, -1.0],
        corners: [
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0],
        ],
    },
    Face {
        normal: [0.0, 0.0, 1.0],
        corners: [
            [0.0, 0.0, 1.0],
            [0.0, 1.0, 1.0],
            [1.0, 1.0, 1.0],
            [1.0, 0.0, 1.0],
        ],
    },
];

const FACE_NEIGHBOR_OFFSETS: [(isize, isize, isize); 6] = [
    (-1, 0, 0),
    (1, 0, 0),
    (0, -1, 0),
    (0, 1, 0),
    (0, 0, -1),
    (0, 0, 1),
];

#[no_mangle]
pub extern "C" fn mm_core_api_version() -> u32 {
    1
}

#[no_mangle]
pub extern "C" fn mm_alloc(size: usize) -> *mut u8 {
    if size == 0 {
        return core::ptr::null_mut();
    }

    let layout = match Layout::from_size_align(size, 8) {
        Ok(value) => value,
        Err(_) => return core::ptr::null_mut(),
    };

    // SAFETY: `alloc` is called with a validated layout.
    unsafe { alloc(layout) }
}

#[no_mangle]
pub unsafe extern "C" fn mm_free(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 {
        return;
    }

    let layout = match Layout::from_size_align(size, 8) {
        Ok(value) => value,
        Err(_) => return,
    };

    // SAFETY: `ptr`/`layout` must match prior `mm_alloc` call.
    dealloc(ptr, layout);
}

#[no_mangle]
pub extern "C" fn mm_mesh_stats_quads(block_count: u32) -> u32 {
    MeshStats::from_quads(block_count.saturating_mul(6)).quads
}

#[no_mangle]
pub extern "C" fn mm_mesh_stats_vertices(block_count: u32) -> u32 {
    MeshStats::from_quads(block_count.saturating_mul(6)).vertices
}

#[no_mangle]
pub extern "C" fn mm_mesh_stats_indices(block_count: u32) -> u32 {
    MeshStats::from_quads(block_count.saturating_mul(6)).indices
}

#[no_mangle]
pub unsafe extern "C" fn mm_mesh_exposed_quads(
    width: u32,
    height: u32,
    depth: u32,
    occupancy_ptr: *const u8,
    occupancy_len: u32,
) -> u32 {
    let Some((w, h, d, occupancy)) =
        validated_occupancy(width, height, depth, occupancy_ptr, occupancy_len)
    else {
        return 0;
    };

    exposed_quads(w, h, d, occupancy)
}

#[no_mangle]
pub unsafe extern "C" fn mm_mesh_extract_vertex_count(
    width: u32,
    height: u32,
    depth: u32,
    occupancy_ptr: *const u8,
    occupancy_len: u32,
) -> u32 {
    let Some((w, h, d, occupancy)) =
        validated_occupancy(width, height, depth, occupancy_ptr, occupancy_len)
    else {
        return 0;
    };

    exposed_quads(w, h, d, occupancy).saturating_mul(4)
}

#[no_mangle]
pub unsafe extern "C" fn mm_mesh_extract_index_count(
    width: u32,
    height: u32,
    depth: u32,
    occupancy_ptr: *const u8,
    occupancy_len: u32,
) -> u32 {
    let Some((w, h, d, occupancy)) =
        validated_occupancy(width, height, depth, occupancy_ptr, occupancy_len)
    else {
        return 0;
    };

    exposed_quads(w, h, d, occupancy).saturating_mul(6)
}

#[no_mangle]
pub unsafe extern "C" fn mm_mesh_extract_positions(
    width: u32,
    height: u32,
    depth: u32,
    occupancy_ptr: *const u8,
    occupancy_len: u32,
    out_ptr: *mut f32,
    out_len: u32,
) -> u32 {
    let Some((w, h, d, occupancy)) =
        validated_occupancy(width, height, depth, occupancy_ptr, occupancy_len)
    else {
        return 0;
    };

    let mesh = extract_mesh(w, h, d, occupancy);
    write_f32_output(&mesh.positions, out_ptr, out_len)
}

#[no_mangle]
pub unsafe extern "C" fn mm_mesh_extract_normals(
    width: u32,
    height: u32,
    depth: u32,
    occupancy_ptr: *const u8,
    occupancy_len: u32,
    out_ptr: *mut f32,
    out_len: u32,
) -> u32 {
    let Some((w, h, d, occupancy)) =
        validated_occupancy(width, height, depth, occupancy_ptr, occupancy_len)
    else {
        return 0;
    };

    let mesh = extract_mesh(w, h, d, occupancy);
    write_f32_output(&mesh.normals, out_ptr, out_len)
}

#[no_mangle]
pub unsafe extern "C" fn mm_mesh_extract_uvs(
    width: u32,
    height: u32,
    depth: u32,
    occupancy_ptr: *const u8,
    occupancy_len: u32,
    out_ptr: *mut f32,
    out_len: u32,
) -> u32 {
    let Some((w, h, d, occupancy)) =
        validated_occupancy(width, height, depth, occupancy_ptr, occupancy_len)
    else {
        return 0;
    };

    let mesh = extract_mesh(w, h, d, occupancy);
    write_f32_output(&mesh.uvs, out_ptr, out_len)
}

#[no_mangle]
pub unsafe extern "C" fn mm_mesh_extract_indices(
    width: u32,
    height: u32,
    depth: u32,
    occupancy_ptr: *const u8,
    occupancy_len: u32,
    out_ptr: *mut u32,
    out_len: u32,
) -> u32 {
    let Some((w, h, d, occupancy)) =
        validated_occupancy(width, height, depth, occupancy_ptr, occupancy_len)
    else {
        return 0;
    };

    let mesh = extract_mesh(w, h, d, occupancy);
    write_u32_output(&mesh.indices, out_ptr, out_len)
}

unsafe fn validated_occupancy<'a>(
    width: u32,
    height: u32,
    depth: u32,
    occupancy_ptr: *const u8,
    occupancy_len: u32,
) -> Option<(usize, usize, usize, &'a [u8])> {
    if width == 0 || height == 0 || depth == 0 || occupancy_ptr.is_null() {
        return None;
    }

    let (w, h, d, expected_len) = validated_dimensions(width, height, depth)?;
    let len = occupancy_len as usize;
    if len < expected_len {
        return None;
    }

    let occupancy = slice::from_raw_parts(occupancy_ptr, len);
    Some((w, h, d, occupancy))
}

fn validated_dimensions(width: u32, height: u32, depth: u32) -> Option<(usize, usize, usize, usize)> {
    usize::try_from(width)
        .ok()
        .and_then(|w| usize::try_from(height).ok().map(|h| (w, h)))
        .and_then(|(w, h)| usize::try_from(depth).ok().map(|d| (w, h, d)))
        .and_then(|(w, h, d)| w.checked_mul(h).and_then(|wh| wh.checked_mul(d).map(|size| (w, h, d, size))))
}

fn exposed_quads(width: usize, height: usize, depth: usize, occupancy: &[u8]) -> u32 {
    let mut quads: u32 = 0;

    for y in 0..height {
        for z in 0..depth {
            for x in 0..width {
                if !is_occupied(width, depth, occupancy, x, y, z) {
                    continue;
                }

                for (dx, dy, dz) in FACE_NEIGHBOR_OFFSETS {
                    if !is_occupied_checked(width, height, depth, occupancy, x as isize + dx, y as isize + dy, z as isize + dz) {
                        quads = quads.saturating_add(1);
                    }
                }
            }
        }
    }

    quads
}

fn extract_mesh(width: usize, height: usize, depth: usize, occupancy: &[u8]) -> MeshBuffers {
    let mut mesh = MeshBuffers {
        positions: Vec::new(),
        normals: Vec::new(),
        uvs: Vec::new(),
        indices: Vec::new(),
    };

    for y in 0..height {
        for z in 0..depth {
            for x in 0..width {
                if !is_occupied(width, depth, occupancy, x, y, z) {
                    continue;
                }

                for (face_index, (dx, dy, dz)) in FACE_NEIGHBOR_OFFSETS.iter().enumerate() {
                    if !is_occupied_checked(
                        width,
                        height,
                        depth,
                        occupancy,
                        x as isize + dx,
                        y as isize + dy,
                        z as isize + dz,
                    ) {
                        emit_face(&mut mesh, x as f32, y as f32, z as f32, &FACES[face_index]);
                    }
                }
            }
        }
    }

    mesh
}

fn emit_face(mesh: &mut MeshBuffers, base_x: f32, base_y: f32, base_z: f32, face: &Face) {
    let base_vertex = (mesh.positions.len() / 3) as u32;

    for corner in face.corners {
        mesh.positions.push(base_x + corner[0]);
        mesh.positions.push(base_y + corner[1]);
        mesh.positions.push(base_z + corner[2]);

        mesh.normals.extend_from_slice(&face.normal);
    }

    mesh.uvs.extend_from_slice(&UVS);
    mesh.indices.extend_from_slice(&[
        base_vertex,
        base_vertex + 1,
        base_vertex + 2,
        base_vertex,
        base_vertex + 2,
        base_vertex + 3,
    ]);
}

unsafe fn write_f32_output(source: &[f32], out_ptr: *mut f32, out_len: u32) -> u32 {
    if out_ptr.is_null() {
        return 0;
    }

    let needed = source.len();
    let out_len_usize = out_len as usize;
    if out_len_usize < needed {
        return 0;
    }

    let out = slice::from_raw_parts_mut(out_ptr, out_len_usize);
    out[..needed].copy_from_slice(source);
    u32::try_from(needed).unwrap_or(u32::MAX)
}

unsafe fn write_u32_output(source: &[u32], out_ptr: *mut u32, out_len: u32) -> u32 {
    if out_ptr.is_null() {
        return 0;
    }

    let needed = source.len();
    let out_len_usize = out_len as usize;
    if out_len_usize < needed {
        return 0;
    }

    let out = slice::from_raw_parts_mut(out_ptr, out_len_usize);
    out[..needed].copy_from_slice(source);
    u32::try_from(needed).unwrap_or(u32::MAX)
}

fn is_occupied_checked(
    width: usize,
    height: usize,
    depth: usize,
    occupancy: &[u8],
    x: isize,
    y: isize,
    z: isize,
) -> bool {
    if x < 0 || y < 0 || z < 0 {
        return false;
    }

    let ux = x as usize;
    let uy = y as usize;
    let uz = z as usize;
    if ux >= width || uy >= height || uz >= depth {
        return false;
    }
    is_occupied(width, depth, occupancy, ux, uy, uz)
}

fn is_occupied(width: usize, depth: usize, occupancy: &[u8], x: usize, y: usize, z: usize) -> bool {
    let index = (y * depth * width) + (z * width) + x;
    index < occupancy.len() && occupancy[index] != 0
}

#[cfg(test)]
mod tests {
    use super::{extract_mesh, exposed_quads, mm_core_api_version, MeshStats};

    #[test]
    fn mesh_stats_scale_with_block_count() {
        assert_eq!(MeshStats::from_quads(0).quads, 0);
        assert_eq!(MeshStats::from_quads(12).vertices, 48);
        assert_eq!(MeshStats::from_quads(12).indices, 72);
    }

    #[test]
    fn api_version_is_stable() {
        assert_eq!(mm_core_api_version(), 1);
    }

    #[test]
    fn exposed_quads_single_block() {
        let occupancy = vec![1u8];
        assert_eq!(exposed_quads(1, 1, 1, &occupancy), 6);
    }

    #[test]
    fn exposed_quads_two_adjacent_blocks() {
        let occupancy = vec![1u8, 1u8];
        assert_eq!(exposed_quads(2, 1, 1, &occupancy), 10);
    }

    #[test]
    fn extract_mesh_single_block_lengths() {
        let occupancy = vec![1u8];
        let mesh = extract_mesh(1, 1, 1, &occupancy);
        assert_eq!(mesh.positions.len(), 6 * 4 * 3);
        assert_eq!(mesh.normals.len(), 6 * 4 * 3);
        assert_eq!(mesh.uvs.len(), 6 * 4 * 2);
        assert_eq!(mesh.indices.len(), 6 * 6);
    }

    #[test]
    fn extract_mesh_two_adjacent_blocks_lengths() {
        let occupancy = vec![1u8, 1u8];
        let mesh = extract_mesh(2, 1, 1, &occupancy);
        assert_eq!(mesh.positions.len(), 10 * 4 * 3);
        assert_eq!(mesh.normals.len(), 10 * 4 * 3);
        assert_eq!(mesh.uvs.len(), 10 * 4 * 2);
        assert_eq!(mesh.indices.len(), 10 * 6);
    }
}
