// Reference Trait Specification — FleetAdapter (2.0.0, Audit-Remediated)
// Single canonical definition (fixes final/01_AUDIT.md §4.1 triple pasted definitions).

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::error::FleetError;

#[async_trait]
pub trait FleetAdapter: Send + Sync {
    async fn connect(&self, config: FleetConfig) -> Result<FleetConnection, FleetError>;
    async fn list_robots(&self, conn: &FleetConnection) -> Result<Vec<RobotInfo>, FleetError>;
    async fn get_telemetry(&self, conn: &FleetConnection, robot_id: &str) -> Result<TelemetryStream, FleetError>;
    async fn send_command(&self, conn: &FleetConnection, robot_id: &str, cmd: RobotCommand) -> Result<CommandResult, FleetError>;
    async fn subscribe_events(&self, conn: &FleetConnection, robot_id: &str) -> Result<EventStream, FleetError>;
    fn provider_name(&self) -> &'static str;
    fn supported_robots(&self) -> Vec<String>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FleetConfig {
    pub provider: FleetProvider,
    pub endpoint: String,
    pub auth: AuthConfig,
    pub robot_filters: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FleetProvider {
    Formant,
    InOrbit,
    Rapyuta,
    ROS2Bridge,
    Vda5050Mqtt,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub api_key: Option<String>,
    pub token: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub cert_path: Option<String>,
    pub key_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FleetConnection {
    pub connection_id: String,
    pub provider: FleetProvider,
    pub endpoint: String,
    pub connected_at: chrono::DateTime<chrono::Utc>,
    pub active_robots: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pose6D {
    pub position: [f32; 3],
    pub orientation: [f32; 4],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RobotInfo {
    pub robot_id: String,
    pub name: String,
    pub robot_type: String,
    pub status: RobotStatus,
    pub location: Option<Pose6D>,
    pub last_seen: chrono::DateTime<chrono::Utc>,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RobotStatus {
    Online,
    Offline,
    Error,
    Maintenance,
    Teleop,
    Autonomous,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryStream {
    pub robot_id: String,
    pub joint_states: JointStateStream,
    pub sensor_streams: Vec<SensorStream>,
    pub events: EventStream,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JointStateStream {
    pub robot_id: String,
    pub positions: Vec<f32>,
    pub velocities: Vec<f32>,
    pub efforts: Vec<f32>,
    pub names: Vec<String>,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorStream {
    pub sensor_id: String,
    pub sensor_type: SensorType,
    pub data: Vec<u8>,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SensorType {
    Camera,
    Depth,
    Lidar,
    ForceTorque,
    IMU,
    Tactile,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventStream {
    pub robot_id: String,
    pub events: Vec<FleetEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FleetEvent {
    pub event_type: EventType,
    pub robot_id: String,
    pub message: String,
    pub severity: Severity,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EventType {
    Connected,
    Disconnected,
    Error,
    Warning,
    Info,
    TeleopStarted,
    TeleopEnded,
    CommandReceived,
    CommandCompleted,
    CommandFailed,
    SafetyTriggered,
    BatteryLow,
    CommunicationLost,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Severity {
    Info,
    Warning,
    Error,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RobotCommand {
    pub command_type: CommandType,
    pub target_joint_positions: Option<Vec<f32>>,
    pub target_end_effector_pose: Option<Pose6D>,
    pub gripper_command: Option<f32>,
    pub trajectory: Option<Trajectory>,
    pub safety_limits: SafetyLimits,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CommandType {
    JointPosition,
    EndEffectorPose,
    Trajectory,
    Teleop,
    Stop,
    Home,
    Gripper,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trajectory {
    pub waypoints: Vec<Waypoint>,
    pub interpolation: InterpolationType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Waypoint {
    pub joint_positions: Vec<f32>,
    pub time_from_start: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InterpolationType {
    Linear,
    Cubic,
    Quintic,
    JointTrajectory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyLimits {
    pub max_velocity: Option<f32>,
    pub max_acceleration: Option<f32>,
    pub max_force: Option<f32>,
    pub workspace_limits: Option<WorkspaceLimits>,
    pub joint_limits: Option<Vec<JointLimit>>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    pub success: bool,
    pub message: String,
    pub command_id: String,
    pub timestamp_ms: u64,
}
