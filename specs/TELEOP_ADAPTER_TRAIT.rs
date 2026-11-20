// Reference Trait Specification — TeleopAdapter (2.0.0, Audit-Remediated)
// Single canonical definition with Lokahi Rule 14/18 S2 safety envelope; removes erroneous
// Germany StVFernLV §10 motor-vehicle flag from generic robot teleoperation (fixes final/01_AUDIT.md P0-3 & §4.1).

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::error::TeleopError;

#[async_trait]
pub trait TeleopAdapter: Send + Sync {
    async fn launch(&self, config: TeleopConfig) -> Result<TeleopSession, TeleopError>;
    async fn send_pose(&self, session: &mut TeleopSession, pose: Pose6D) -> Result<(), TeleopError>;
    async fn send_joints(&self, session: &mut TeleopSession, joints: Vec<f32>) -> Result<(), TeleopError>;
    async fn get_video_stream(&self, session: &TeleopSession) -> Result<VideoStream, TeleopError>;
    async fn get_robot_state(&self, session: &TeleopSession) -> Result<RobotState, TeleopError>;
    async fn emergency_stop(&self, session: &mut TeleopSession) -> Result<(), TeleopError>;
    fn latency_target_ms(&self) -> u32;
    fn supports_multi_robot(&self) -> bool;
    fn provider_name(&self) -> &'static str;
    async fn supervise_fleet(&self, config: FleetTeleopConfig) -> Result<MultiRobotSession, TeleopError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeleopConfig {
    pub robot_id: String,
    pub robot_type: String,
    pub fleet_provider: Option<String>,
    pub mode: TeleopMode,
    pub latency_target_ms: u32,
    pub safety: SafetyConfig,
    pub mapping: TeleopMapping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TeleopMode {
    WebXR,
    WebRTC,
    ROS2,
    Gamepad,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeleopSession {
    pub session_id: String,
    pub robot_id: String,
    pub mode: TeleopMode,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub latency_ms: u32,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoStream {
    pub stream_id: String,
    pub format: VideoFormat,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub stream_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VideoFormat {
    H264,
    VP8,
    VP9,
    MJPEG,
    WebRTC,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pose6D {
    pub position: [f32; 3],
    pub orientation: [f32; 4],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RobotState {
    pub robot_id: String,
    pub joint_positions: Vec<f32>,
    pub joint_velocities: Vec<f32>,
    pub end_effector_pose: Pose6D,
    pub gripper_state: f32,
    pub timestamp_ms: u64,
}

/// Development safety envelope for teleoperation (not a certified safety function; see ISO 10218 / ISO/TS 15066).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyConfig {
    pub e_stop_timeout_ms: u32,
    pub workspace_limits: WorkspaceLimits,
    pub collision_avoidance: bool,
    pub max_velocity: f32,
    pub max_acceleration: f32,
    pub lokahi_s2_approval_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeleopMapping {
    pub input_device: InputDevice,
    pub coordinate_frame: CoordinateFrame,
    pub joint_mapping: Vec<JointMapping>,
    pub safety_limits: SafetyLimits,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InputDevice {
    WebXRHeadset,
    WebXRPhone,
    Gamepad,
    Keyboard,
    SpaceMouse,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CoordinateFrame {
    Base,
    EndEffector,
    World,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JointMapping {
    pub input_axis: String,
    pub joint_name: String,
    pub scale: f32,
    pub offset: f32,
    pub deadband: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyLimits {
    pub max_velocity: f32,
    pub max_acceleration: f32,
    pub max_force: f32,
    pub joint_limits: Vec<JointLimit>,
    pub workspace_limits: WorkspaceLimits,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceLimits {
    pub min: [f32; 3],
    pub max: [f32; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JointLimit {
    pub joint_name: String,
    pub min: f32,
    pub max: f32,
    pub velocity_limit: f32,
    pub acceleration_limit: f32,
    pub effort_limit: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FleetTeleopConfig {
    pub fleet_provider: String,
    pub robot_ids: Vec<String>,
    pub max_robots_per_operator: u32,
    pub priority_queue: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiRobotSession {
    pub session_id: String,
    pub robot_sessions: Vec<TeleopSession>,
    pub active_robot: Option<String>,
    pub operator_id: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
}
