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

#[no_mangle]
pub extern "C" fn mm_core_api_version() -> u32 {
    1
}

#[no_mangle]
pub extern "C" fn mm_alloc(size: usize) -> *mut u8 {
    if size == 0 {
        return core::ptr::null_mut();
    }

    let mut buffer = Vec::<u8>::with_capacity(size);
    let pointer = buffer.as_mut_ptr();
    core::mem::forget(buffer);
    pointer
}

#[no_mangle]
pub unsafe extern "C" fn mm_free(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 {
        return;
    }

    let _ = Vec::from_raw_parts(ptr, 0, size);
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
    if width == 0 || height == 0 || depth == 0 || occupancy_ptr.is_null() {
        return 0;
    }

    let expected = match usize::try_from(width)
        .ok()
        .and_then(|w| usize::try_from(height).ok().map(|h| (w, h)))
        .and_then(|(w, h)| usize::try_from(depth).ok().map(|d| (w, h, d)))
        .and_then(|(w, h, d)| w.checked_mul(h).and_then(|wh| wh.checked_mul(d)))
    {
        Some(value) => value,
        None => return 0,
    };

    let len = occupancy_len as usize;
    if len < expected {
        return 0;
    }

    let occupancy = core::slice::from_raw_parts(occupancy_ptr, len);
    exposed_quads(width as usize, height as usize, depth as usize, occupancy)
}

fn exposed_quads(width: usize, height: usize, depth: usize, occupancy: &[u8]) -> u32 {
    let mut quads: u32 = 0;

    for y in 0..height {
        for z in 0..depth {
            for x in 0..width {
                if !is_occupied(width, depth, occupancy, x, y, z) {
                    continue;
                }

                if !is_occupied_checked(width, height, depth, occupancy, x as isize - 1, y as isize, z as isize) {
                    quads = quads.saturating_add(1);
                }
                if !is_occupied_checked(width, height, depth, occupancy, x as isize + 1, y as isize, z as isize) {
                    quads = quads.saturating_add(1);
                }
                if !is_occupied_checked(width, height, depth, occupancy, x as isize, y as isize - 1, z as isize) {
                    quads = quads.saturating_add(1);
                }
                if !is_occupied_checked(width, height, depth, occupancy, x as isize, y as isize + 1, z as isize) {
                    quads = quads.saturating_add(1);
                }
                if !is_occupied_checked(width, height, depth, occupancy, x as isize, y as isize, z as isize - 1) {
                    quads = quads.saturating_add(1);
                }
                if !is_occupied_checked(width, height, depth, occupancy, x as isize, y as isize, z as isize + 1) {
                    quads = quads.saturating_add(1);
                }
            }
        }
    }

    quads
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
    use super::{exposed_quads, mm_core_api_version, MeshStats};

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
}
