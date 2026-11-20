// Reference Trait Specification — SimAdapter (2.0.0, Audit-Remediated)
// Uses Factory + Session Handle ownership pattern (fixes final/01_AUDIT.md §4.1 & §4.2).

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::error::SimError;
use crate::ir::{ActionChunk, RobotSpec};

#[async_trait]
pub trait SimAdapter: Send + Sync {
    /// Launch a simulation session using a stateless factory method.
    async fn launch(&self, config: SimLaunchConfig) -> Result<SimSession, SimError>;

    /// Step a simulation session with an action chunk.
    async fn step(&self, session: &mut SimSession, action: ActionChunk) -> Result<SimState, SimError>;

    /// Reset a simulation session to its initial state.
    async fn reset(&self, session: &mut SimSession) -> Result<SimState, SimError>;

    /// Render the current frame from the session's active camera.
    async fn render(&self, session: &SimSession) -> Result<RenderOutput, SimError>;

    /// Get backend identifier.
    fn backend_name(&self) -> &'static str;

    /// Supported robot embodiments.
    fn supported_robots(&self) -> Vec<String>;

    /// Check if backend runtime is available on the host.
    async fn is_available(&self) -> bool;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimLaunchConfig {
    pub robot: RobotSpec,
    pub scene: SceneSpec,
    pub backend: SimBackend,
    pub headless: bool,
    pub timestep: f32,
    pub physics: PhysicsConfig,
    pub rendering: RenderingConfig,
    pub seed: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SimBackend {
    MuJoCoWASM,
    MuJoCoCPU,
    Gazebo,
    IsaacSim,
    IsaacSimCloud,
    Genesis,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimSession {
    pub session_id: String,
    pub backend: SimBackend,
    pub robot: RobotSpec,
    pub scene: SceneSpec,
    pub state: SimState,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pose6D {
    pub position: [f32; 3],
    pub orientation: [f32; 4], // quaternion [x, y, z, w]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimState {
    pub joint_positions: Vec<f32>,
    pub joint_velocities: Vec<f32>,
    pub joint_efforts: Vec<f32>,
    pub end_effector_pose: Pose6D,
    pub contact_forces: Vec<ContactForce>,
    pub sensor_data: SensorData,
    pub simulation_time: f64,
    pub step_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderOutput {
    pub rgb: Option<Vec<u8>>,
    pub depth: Option<Vec<f32>>,
    pub segmentation: Option<Vec<u32>>,
    pub camera_pose: Pose6D,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneSpec {
    pub name: String,
    pub description: String,
    pub objects: Vec<ObjectSpec>,
    pub lighting: LightingConfig,
    pub ground: GroundConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhysicsConfig {
    pub solver: SolverType,
    pub iterations: u32,
    pub gravity: [f32; 3],
    pub timestep: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SolverType {
    Newton,
    CG,
    NewtonMGS,
    PGS,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderingConfig {
    pub enabled: bool,
    pub fps: u32,
    pub resolution: [u32; 2],
    pub camera: CameraConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraConfig {
    pub position: [f32; 3],
    pub target: [f32; 3],
    pub up: [f32; 3],
    pub fov: f32,
    pub near: f32,
    pub far: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LightingConfig {
    pub ambient: [f32; 3],
    pub directional: Option<DirectionalLight>,
    pub point_lights: Vec<PointLight>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectionalLight {
    pub direction: [f32; 3],
    pub color: [f32; 3],
    pub intensity: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointLight {
    pub position: [f32; 3],
    pub color: [f32; 3],
    pub intensity: f32,
    pub range: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroundConfig {
    pub enabled: bool,
    pub size: [f32; 2],
    pub material: GroundMaterial,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GroundMaterial {
    Plane,
    Checkerboard,
    Grid,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectSpec {
    pub name: String,
    pub geometry: GeometryType,
    pub size: [f32; 3],
    pub color: String,
    pub pose: Option<Pose6D>,
    pub mass: Option<f32>,
    pub friction: Option<f32>,
    pub restitution: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GeometryType {
    Box,
    Sphere,
    Cylinder,
    Capsule,
    Mesh,
    Cube,
    Plane,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContactForce {
    pub body1: String,
    pub body2: String,
    pub force: [f32; 3],
    pub torque: [f32; 3],
    pub position: [f32; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorData {
    pub images: Vec<ImageData>,
    pub joint_states: JointStateData,
    pub force_torque: Option<ForceTorqueData>,
    pub imu: Option<IMUData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageData {
    pub name: String,
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub format: ImageFormat,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImageFormat {
    JPEG,
    PNG,
    RAW,
    Depth,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JointStateData {
    pub positions: Vec<f32>,
    pub velocities: Vec<f32>,
    pub efforts: Vec<f32>,
    pub names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForceTorqueData {
    pub force: [f32; 3],
    pub torque: [f32; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IMUData {
    pub orientation: [f32; 4],
    pub angular_velocity: [f32; 3],
    pub linear_acceleration: [f32; 3],
}
