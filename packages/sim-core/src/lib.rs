use wasm_bindgen::prelude::*;

// Deterministic xorshift32 RNG for reproducible simulation steps.
#[wasm_bindgen]
pub fn next_seed(seed: u32) -> u32 {
    let mut x = seed;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    x
}

#[wasm_bindgen]
pub fn sample_unit(seed: u32) -> f32 {
    let value = next_seed(seed);
    (value as f32) / (u32::MAX as f32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_rng_progression() {
        let seed = 123_456_u32;
        let first = next_seed(seed);
        let second = next_seed(seed);
        assert_eq!(first, second);
    }

    #[test]
    fn sample_is_bounded() {
        let value = sample_unit(42);
        assert!((0.0..=1.0).contains(&value));
    }
}
