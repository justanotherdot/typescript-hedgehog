use wasm_bindgen::prelude::*;

mod error;
use error::Error;

/// Data formats supported by the buffer API
#[derive(Debug, Clone, Copy, PartialEq)]
#[wasm_bindgen]
pub enum DataFormat {
    /// 32-bit unsigned integers, little-endian
    U32LE = 0,
    /// 64-bit floating point, little-endian
    F64LE = 1,
    /// Boolean values as u8 (0 or 1)
    BoolU8 = 2,
}

impl DataFormat {
    fn from_u8(value: u8) -> Result<Self, Error> {
        match value {
            0 => Ok(DataFormat::U32LE),
            1 => Ok(DataFormat::F64LE),
            2 => Ok(DataFormat::BoolU8),
            _ => Err(Error::invalid_format(value)),
        }
    }

    fn bytes_per_element(self) -> u64 {
        match self {
            DataFormat::U32LE => 4,
            DataFormat::F64LE => 8,
            DataFormat::BoolU8 => 1,
        }
    }
}

/// SplitMix64 constants from the reference implementation
const GOLDEN_GAMMA: u64 = 0x9e3779b97f4a7c15;
const MIX_MULTIPLIER_1: u64 = 0xbf58476d1ce4e5b9;
const MIX_MULTIPLIER_2: u64 = 0x94d049bb133111eb;

/// Core SplitMix64 mixing function
fn splitmix64_mix(mut z: u64) -> u64 {
    z = z.wrapping_add(GOLDEN_GAMMA);
    z = (z ^ (z >> 30)).wrapping_mul(MIX_MULTIPLIER_1);
    z = (z ^ (z >> 27)).wrapping_mul(MIX_MULTIPLIER_2);
    z ^ (z >> 31)
}

/// Generate gamma value (must be odd for maximal period)
fn mix_gamma(mut z: u64) -> u64 {
    z = splitmix64_mix(z);
    // Ensure gamma is odd for maximal period
    (z | 1).wrapping_mul(GOLDEN_GAMMA)
}

/// SplitMix64 seed with state and gamma
#[wasm_bindgen]
pub struct Seed {
    state: u64,
    gamma: u64,
}

#[wasm_bindgen]
impl Seed {
    /// Create a new seed from a number
    #[wasm_bindgen(constructor)]
    pub fn new(value: u64) -> Seed {
        let state = splitmix64_mix(value);
        let gamma = mix_gamma(state);
        Seed { state, gamma }
    }

    /// Create seed from state and gamma components
    #[wasm_bindgen]
    pub fn from_parts(state: u64, gamma: u64) -> Seed {
        Seed { state, gamma }
    }

    /// Get the state component
    #[wasm_bindgen(getter)]
    pub fn state(&self) -> u64 {
        self.state
    }

    /// Get the gamma component  
    #[wasm_bindgen(getter)]
    pub fn gamma(&self) -> u64 {
        self.gamma
    }

    /// Generate next random u64 and new seed
    #[wasm_bindgen]
    pub fn next_u64(&self) -> SeedAndValue {
        let new_state = self.state.wrapping_add(self.gamma);
        let output = splitmix64_mix(new_state);
        let new_seed = Seed {
            state: new_state,
            gamma: self.gamma,
        };
        SeedAndValue {
            seed: new_seed,
            value: output,
        }
    }

    /// Generate bounded random value
    #[wasm_bindgen]
    pub fn next_bounded(&self, bound: u64) -> SeedAndValue {
        let result = self.next_u64();
        let bounded_value = ((result.value as u128 * bound as u128) >> 64) as u64;
        SeedAndValue {
            seed: result.seed,
            value: bounded_value,
        }
    }

    /// Generate random boolean
    #[wasm_bindgen]
    pub fn next_bool(&self) -> SeedAndBool {
        let result = self.next_u64();
        SeedAndBool {
            seed: result.seed,
            value: result.value & 1 == 1,
        }
    }

    /// Split seed into two independent seeds
    #[wasm_bindgen]
    pub fn split(&self) -> SeedPair {
        let new_state = self.state.wrapping_add(self.gamma);
        let output = splitmix64_mix(new_state);
        let new_gamma = mix_gamma(output);

        let left_seed = Seed {
            state: new_state,
            gamma: self.gamma,
        };
        let right_seed = Seed {
            state: output,
            gamma: new_gamma,
        };

        SeedPair {
            left: left_seed,
            right: right_seed,
        }
    }

    /// Generate multiple booleans in a single call (batched for performance)
    #[wasm_bindgen]
    pub fn next_bools_batch(&self, count: u32) -> BatchBoolResult {
        let mut results = Vec::with_capacity(count as usize);
        let mut current_state = self.state;
        let gamma = self.gamma;

        for _ in 0..count {
            current_state = current_state.wrapping_add(gamma);
            let output = splitmix64_mix(current_state);
            results.push(if output & 1 == 1 { 1 } else { 0 });
        }

        BatchBoolResult {
            values: results,
            final_seed: Seed {
                state: current_state,
                gamma,
            },
        }
    }

    /// Fill generic byte buffer with random data using structured protocol
    /// Buffer layout: [1 byte format][8 bytes count][data bytes...]
    #[wasm_bindgen]
    pub fn fill_buffer(
        &self,
        buffer: &mut [u8],
        format_u8: u8,
        count: u64,
        bound: Option<u32>,
    ) -> Result<Seed, Error> {
        // Validation limits
        const PRACTICAL_MAX_BUFFER: u64 = 1024 * 1024 * 1024; // 1GB conservative limit

        if buffer.len() as u64 > PRACTICAL_MAX_BUFFER {
            return Err(Error::buffer_too_large(
                buffer.len() as u64 >> 20,
                PRACTICAL_MAX_BUFFER >> 20,
            ));
        }

        let format = DataFormat::from_u8(format_u8)?;
        let bytes_per_element = format.bytes_per_element();
        let header_size = 9; // 1 byte format + 8 bytes count
        let data_size = count * bytes_per_element;
        let required_size = header_size + data_size;

        if buffer.len() < required_size as usize {
            return Err(Error::buffer_too_small(required_size, buffer.len()));
        }

        // Write header
        buffer[0] = format_u8;
        buffer[1..9].copy_from_slice(&count.to_le_bytes());

        // Generate data
        let mut current_state = self.state;
        let gamma = self.gamma;
        let data_start = header_size as usize;

        match format {
            DataFormat::U32LE => {
                let bound_u64 = bound.unwrap_or(u32::MAX) as u64;
                for i in 0..count as usize {
                    current_state = current_state.wrapping_add(gamma);
                    let output = splitmix64_mix(current_state);
                    let bounded = if bound_u64 == u32::MAX as u64 {
                        output as u32
                    } else {
                        ((output as u128 * bound_u64 as u128) >> 64) as u32
                    };
                    let offset = data_start + i * 4;
                    buffer[offset..offset + 4].copy_from_slice(&bounded.to_le_bytes());
                }
            }
            DataFormat::F64LE => {
                for i in 0..count as usize {
                    current_state = current_state.wrapping_add(gamma);
                    let output = splitmix64_mix(current_state);
                    // Convert to [0, 1) range with high precision
                    let float_val = (output >> 11) as f64 * (1.0 / (1u64 << 53) as f64);
                    let offset = data_start + i * 8;
                    buffer[offset..offset + 8].copy_from_slice(&float_val.to_le_bytes());
                }
            }
            DataFormat::BoolU8 => {
                for i in 0..count as usize {
                    current_state = current_state.wrapping_add(gamma);
                    let output = splitmix64_mix(current_state);
                    buffer[data_start + i] = if output & 1 == 1 { 1 } else { 0 };
                }
            }
        }

        Ok(Seed {
            state: current_state,
            gamma,
        })
    }
}

/// Return type for operations that produce a seed and u64 value
#[wasm_bindgen]
pub struct SeedAndValue {
    seed: Seed,
    value: u64,
}

#[wasm_bindgen]
impl SeedAndValue {
    #[wasm_bindgen(getter)]
    pub fn seed(&self) -> Seed {
        Seed {
            state: self.seed.state,
            gamma: self.seed.gamma,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn value(&self) -> u64 {
        self.value
    }
}

/// Return type for operations that produce a seed and boolean value
#[wasm_bindgen]
pub struct SeedAndBool {
    seed: Seed,
    value: bool,
}

#[wasm_bindgen]
impl SeedAndBool {
    #[wasm_bindgen(getter)]
    pub fn seed(&self) -> Seed {
        Seed {
            state: self.seed.state,
            gamma: self.seed.gamma,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn value(&self) -> bool {
        self.value
    }
}

/// Return type for seed splitting
#[wasm_bindgen]
pub struct SeedPair {
    left: Seed,
    right: Seed,
}

/// Return type for batch boolean operations
#[wasm_bindgen]
pub struct BatchBoolResult {
    values: Vec<u8>,
    final_seed: Seed,
}

#[wasm_bindgen]
impl SeedPair {
    #[wasm_bindgen(getter)]
    pub fn left(&self) -> Seed {
        Seed {
            state: self.left.state,
            gamma: self.left.gamma,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn right(&self) -> Seed {
        Seed {
            state: self.right.state,
            gamma: self.right.gamma,
        }
    }
}

#[wasm_bindgen]
impl BatchBoolResult {
    #[wasm_bindgen(getter)]
    pub fn values(&self) -> Vec<u8> {
        self.values.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn final_seed(&self) -> Seed {
        Seed {
            state: self.final_seed.state,
            gamma: self.final_seed.gamma,
        }
    }
}
