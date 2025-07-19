use wasm_bindgen::prelude::*;

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