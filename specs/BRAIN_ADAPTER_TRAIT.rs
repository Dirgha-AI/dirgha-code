// Reference Trait Specification — BrainAdapter (2.0.0, Audit-Remediated)
// Single canonical definition (fixes final/01_AUDIT.md §4.1 duplicate definitions & §4.2 'static stream bound).

use async_trait::async_trait;
use futures::Stream;
use serde::{Deserialize, Serialize};
use crate::error::BrainError;
use crate::ir::{RobotSpec, TaskSpec};

#[async_trait]
pub trait BrainAdapter: Send + Sync {
    /// Single inference call returning one or more action chunks.
    async fn infer(&self, request: InferenceRequest) -> Result<InferenceResponse, BrainError>;

    /// Streaming inference for real-time control loops (object-safe with `'static` bound).
    async fn stream_infer(
        &self,
        request: InferenceRequest,
    ) -> Result<Box<dyn Stream<Item = Result<InferenceChunk, BrainError>> + Send + Unpin + 'static>, BrainError>;

    /// Model metadata and license classification (separating code license from model weights license).
    fn model_info(&self) -> ModelInfo;

    /// Check if this brain adapter can handle the specified task.
    fn supports_task(&self, task: &TaskSpec) -> bool;

    /// Supported robot embodiments.
    fn supported_embodiments(&self) -> Vec<String>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceRequest {
    pub observation: Observation,
    pub task: TaskSpec,
    pub robot: RobotSpec,
    pub horizon: usize,
    pub inference_config: InferenceConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Observation {
    pub images: Vec<ImageObservation>,
    pub joint_states: JointStateObservation,
    pub language: Option<String>,
    pub proprioception: Option<Vec<f32>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageObservation {
    pub name: String,
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub format: ImageFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImageFormat {
    JPEG,
    PNG,
    RAW,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JointStateObservation {
    pub positions: Vec<f32>,
    pub velocities: Vec<f32>,
    pub efforts: Option<Vec<f32>>,
    pub joint_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceConfig {
    pub temperature: Option<f32>,
    pub top_k: Option<u32>,
    pub deterministic: bool,
    pub chunk_size: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceResponse {
    pub actions: Vec<ActionChunk>,
    pub metadata: InferenceMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceChunk {
    pub actions: ActionChunk,
    pub is_final: bool,
    pub metadata: InferenceMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pose6D {
    pub position: [f32; 3],
    pub orientation: [f32; 4], // quaternion [x, y, z, w]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionChunk {
    pub joint_positions: Vec<f32>,
    pub joint_velocities: Option<Vec<f32>>,
    pub end_effector_pose: Option<Pose6D>,
    pub gripper_command: Option<f32>,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceMetadata {
    pub model_name: String,
    pub inference_time_ms: u64,
    pub tokens_used: Option<u32>,
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub version: String,
    pub provider: String,
    pub supported_tasks: Vec<String>,
    pub supported_embodiments: Vec<String>,
    pub input_modalities: Vec<InputModality>,
    pub action_dim: usize,
    pub max_horizon: usize,
    pub code_licensing: LicenseInfo,
    pub weights_licensing: LicenseInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InputModality {
    RGB,
    Depth,
    RGBD,
    JointState,
    Language,
    Proprioception,
    Tactile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub license_type: LicenseType,
    pub commercial_use: bool,
    pub attribution_required: bool,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LicenseType {
    Apache2,
    MIT,
    BSD3,
    NvidiaOpenModelLicense,
    Proprietary,
    Custom(String),
}
