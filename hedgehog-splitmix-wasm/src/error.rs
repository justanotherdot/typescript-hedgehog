use std::fmt;
use wasm_bindgen::prelude::*;

/// Structured error types for the hedgehog WASM module
#[derive(Debug, Clone, PartialEq)]
#[wasm_bindgen]
pub enum ErrorKind {
    /// Buffer size exceeds practical limits
    BufferTooLarge,
    /// Buffer is too small for requested operation
    BufferTooSmall,
    /// Unknown or invalid data format specified
    InvalidFormat,
    /// Invalid parameter values
    InvalidParameter,
}

/// Detailed error information
#[derive(Debug, Clone)]
#[wasm_bindgen]
pub struct Error {
    kind: ErrorKind,
    message: String,
    context: Option<String>,
}

#[wasm_bindgen]
impl Error {
    #[wasm_bindgen(constructor)]
    pub fn new(kind: ErrorKind, message: String) -> Error {
        Error {
            kind,
            message,
            context: None,
        }
    }

    pub fn with_context(mut self, context: String) -> Error {
        self.context = Some(context);
        self
    }

    #[wasm_bindgen(getter)]
    pub fn kind(&self) -> ErrorKind {
        self.kind.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn message(&self) -> String {
        self.message.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn context(&self) -> Option<String> {
        self.context.clone()
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.context {
            Some(ctx) => write!(f, "{}: {} (context: {})", self.kind, self.message, ctx),
            None => write!(f, "{}: {}", self.kind, self.message),
        }
    }
}

impl fmt::Display for ErrorKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ErrorKind::BufferTooLarge => write!(f, "BufferTooLarge"),
            ErrorKind::BufferTooSmall => write!(f, "BufferTooSmall"),
            ErrorKind::InvalidFormat => write!(f, "InvalidFormat"),
            ErrorKind::InvalidParameter => write!(f, "InvalidParameter"),
        }
    }
}

impl Error {
    pub fn buffer_too_large(size_mb: u64, limit_mb: u64) -> Error {
        Error::new(
            ErrorKind::BufferTooLarge,
            format!("Buffer size {size_mb}MB exceeds practical limit of {limit_mb}MB"),
        )
    }

    pub fn buffer_too_small(required: u64, provided: usize) -> Error {
        Error::new(
            ErrorKind::BufferTooSmall,
            format!("Buffer too small: {required} bytes required, {provided} provided"),
        )
    }

    pub fn invalid_format(format: u8) -> Error {
        Error::new(
            ErrorKind::InvalidFormat,
            format!("Unknown format: {format}"),
        )
    }

    pub fn invalid_parameter(param: &str, value: &str) -> Error {
        Error::new(
            ErrorKind::InvalidParameter,
            format!("Invalid {param}: {value}"),
        )
    }
}
