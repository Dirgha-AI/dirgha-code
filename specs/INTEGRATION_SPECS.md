# DIRGHA CODE v2 — INTEGRATION SPECIFICATIONS
## Technical Contracts for Brain, Sim, Fleet, Teleop Adapters

**Date:** 26 October 2026  
**Version:** 2.0  
**Status:** Implementation Ready

---

## 1. BRAIN ADAPTER INTERFACE

### Core Trait (Rust)

```rust
// dirgha-core/src/brain/trait.rs
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::ir::{TaskSpec, RobotSpec, Observation, ActionChunk};

#[async_trait]
pub trait BrainAdapter: Send + Sync {
    /// Single inference call
    async fn infer(&self, request: InferenceRequest) -> Result<InferenceResponse, BrainError>;
    
    /// Streaming inference for real-time control
    async fn stream_infer(&self, request: InferenceRequest) -> Result<Box<dyn Stream<Item = Result<InferenceChunk, BrainError>> + Send + Unpin>, BrainError>;
    
    /// Model metadata
    fn model_info(&self) -> ModelInfo;
    
    /// Check if this brain can handle the task
    fn supports_task(&self, task: &TaskSpec) -> bool;
    
    /// Supported embodiments
    fn supported_embodiments(&self) -> Vec<String>;
}

// Request/Response Types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceRequest {
    pub observation: Observation,
    pub task: TaskSpec,
    pub robot: RobotSpec,
    pub horizon: usize,           // Action chunk size (default: 50)
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
    pub data: Vec<u8>,           // JPEG/PNG encoded
    pub width: u32,
    pub height: u32,
    pub format: ImageFormat,
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
pub struct ActionChunk {
    pub joint_positions: Vec<f32>,      // [action_dim]
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
    pub licensing: LicenseInfo,
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
    Proprietary,
    Custom(String),
}
```

### Brain Adapter Implementations

```rust
// Physical Intelligence π0/π0.5 Adapter
pub struct OpenPiAdapter {
    client: reqwest::Client,
    base_url: String,
    model_name: String,
    api_key: Option<String>,
}

impl BrainAdapter for OpenPiAdapter {
    async fn infer(&self, request: InferenceRequest) -> Result<InferenceResponse, BrainError> {
        let response = self.client
            .post(&format!("{}/infer", self.base_url))
            .json(&OpenPiRequest::from(request))
            .send()
            .await?
            .json::<OpenPiResponse>()
            .await?;
        Ok(response.into())
    }
    
    fn model_info(&self) -> ModelInfo {
        ModelInfo {
            name: "pi0.5".to_string(),
            version: "1.0".to_string(),
            provider: "Physical Intelligence".to_string(),
            supported_tasks: vec!["manipulation".to_string(), "pick_and_place".to_string()],
            supported_embodiments: vec!["fr5".to_string(), "ur5e".to_string(), "aloha".to_string()],
            input_modalities: vec![InputModality::RGB, InputModality::JointState, InputModality::Language],
            action_dim: 7,
            max_horizon: 50,
            licensing: LicenseInfo { license_type: LicenseType::Apache2, commercial_use: true, attribution_required: true, url: "https://github.com/Physical-Intelligence/openpi".to_string() },
        }
    }
    
    fn supported_embodiments(&self) -> Vec<String> {
        vec!["fr5".into(), "ur5e".into(), "aloha".into(), "droid".into()]
    }
}

// LeRobot ACT/Diffusion Adapter
pub struct LeRobotAdapter {
    policy_path: PathBuf,
    device: Device,
    policy: Box<dyn Policy>,
}

impl BrainAdapter for LeRobotAdapter {
    async fn infer(&self, request: InferenceRequest) -> Result<InferenceResponse, BrainError> {
        let observation = self.convert_observation(request.observation)?;
        let actions = self.policy.infer(&observation)?;
        Ok(InferenceResponse {
            actions: actions.into_iter().map(|a| ActionChunk::from_lerobot(a)).collect(),
            metadata: InferenceMetadata { ... },
        })
    }
    
    fn model_info(&self) -> ModelInfo {
        ModelInfo {
            name: "ACT".to_string(),
            version: "1.0".to_string(),
            provider: "Hugging Face LeRobot".to_string(),
            supported_tasks: vec!["manipulation", "pick_and_place", "assembly"],
            supported_embodiments: vec!["so101".into(), "fr5".into(), "ur5e".into(), "aloha".into()],
            input_modalities: vec![InputModality::RGB, InputModality::JointState],
            action_dim: 6,
            max_horizon: 50,
            licensing: LicenseInfo { license_type: LicenseType::Apache2, commercial_use: true, attribution_required: true, url: "https://github.com/huggingface/lerobot".to_string() },
        }
    }
}
```

---

## 2. SIMULATION ADAPTER INTERFACE

### Core Trait (Rust)

```rust
// dirgha-core/src/sim/trait.rs
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::ir::{RobotSpec, SceneSpec, SimSpec, ActionChunk, SimState, RenderOutput};

#[async_trait]
pub trait SimAdapter: Send + Sync {
    /// Launch simulation with config
    async fn launch(&self, config: SimLaunchConfig) -> Result<SimSession, SimError>;
    
    /// Step simulation with action
    async fn step(&mut self, session: &mut SimSession, action: ActionChunk) -> Result<SimState, SimError>;
    
    /// Reset simulation
    async fn reset(&mut self, session: &mut SimSession) -> Result<SimState, SimError>;
    
    /// Render current frame
    async fn render(&self, session: &SimSession) -> Result<RenderOutput, SimError>;
    
    /// Get backend identifier
    fn backend_name(&self) -> &'static str;
    
    /// Supported robot types
    fn supported_robots(&self) -> Vec<String>;
    
    /// Check if backend is available
    async fn is_available(&self) -> bool;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimLaunchConfig {
    pub robot: RobotSpec,
    pub scene: SceneSpec,
    pub backend: SimBackend,
    pub headless: bool,
    pub timestep: f32,           // 0.002 = 500Hz
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
    pub rgb: Option<Vec<u8>>,      // JPEG/PNG encoded
    pub depth: Option<Vec<f32>>,
    pub segmentation: Option<Vec<u32>>,
    pub camera_pose: Pose6D,
    pub timestamp_ms: u64,
}
```

### Sim Adapter Implementations

```rust
// MuJoCo WASM Adapter (Your DEX ARM 01 Stack)
pub struct MuJoCoWASMAdapter {
    wasm_module: Option<MujocoWASMModule>,
    three_renderer: Option<ThreeRenderer>,
}

impl SimAdapter for MuJoCoWASMAdapter {
    fn backend_name(&self) -> &'static str { "mujoco-wasm" }
    
    fn supported_robots(&self) -> Vec<String> {
        vec!["fr5".into(), "ur5e".into(), "aloha".into(), "so101".into(), "custom".into()]
    }
    
    async fn is_available(&self) -> bool {
        // Check WASM support in browser
        true
    }
    
    async fn launch(&self, config: SimLaunchConfig) -> Result<SimSession, SimError> {
        // 1. Load MJCF/URDF from config.robot.description
        // 2. Initialize MuJoCo WASM module
        // 3. Create Three.js renderer
        // 4. Set up 500Hz simulation loop
        // 4. Return session
    }
    
    async fn step(&mut self, session: &mut SimSession, action: ActionChunk) -> Result<SimState, SimError> {
        // 1. Apply action to MuJoCo control inputs
        // 2. Step simulation (500Hz = 500 steps per second)
        // 2. Read new state from MuJoCo
        // 3. Return SimState
    }
    
    async fn render(&self, session: &SimSession) -> Result<RenderOutput, SimError> {
        // Use Three.js renderer from your DEX ARM 01 stack
        // Return RGB + depth + segmentation if needed
    }
}

// Gazebo Adapter (Docker-based)
pub struct GazeboAdapter {
    docker_client: DockerClient,
    container_id: Option<String>,
}

impl SimAdapter for GazeboAdapter {
    fn backend_name(&self) -> &'static str { "gazebo" }
    
    async fn launch(&self, config: SimLaunchConfig) -> Result<SimSession, SimError> {
        // 1. Convert Dirgha IR → Gazebo world.sdf + robot.sdf
        // 2. Start Gazebo Harmonic container with GPU
        // 3. Spawn robot + scene
        // 4. Connect ROS 2 bridge
    }
}

// Isaac Sim Cloud Adapter
pub struct IsaacSimCloudAdapter {
    ngc_client: NGCClient,
    session_id: Option<String>,
}

impl SimAdapter for IsaacSimCloudAdapter {
    fn backend_name(&self) -> &'static str { "isaac-sim-cloud" }
    
    async fn launch(&self, config: SimLaunchConfig) -> Result<SimSession, SimError> {
        // 1. Call NVIDIA NGC API to start Isaac Sim instance
        // 2. Upload robot USD + scene USD
        // 5. Enable ROS 2 bridge extension
        // 6. Return session with connection details
    }
}
```

---

## 3. FLEET ADAPTER INTERFACE

### Core Trait (Rust)

```rust
// dirgha-core/src/fleet/trait.rs
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::ir::{RobotSpec, RobotCommand, RobotInfo, TelemetryStream};

#[async_trait]
pub trait FleetAdapter: Send + Sync {
    /// Connect to fleet management system
    async fn connect(&self, config: FleetConfig) -> Result<FleetConnection, FleetError>;
    
    /// List all robots in fleet
    async fn list_robots(&self, conn: &FleetConnection) -> Result<Vec<RobotInfo>, FleetError>;
    
    /// Get telemetry stream for robot
    async fn get_telemetry(&self, conn: &FleetConnection, robot_id: &str) -> Result<TelemetryStream, FleetError>;
    
    /// Send command to robot
    async fn send_command(&self, conn: &FleetConnection, robot_id: &str, cmd: RobotCommand) -> Result<CommandResult, FleetError>;
    
    /// Subscribe to robot events
    async fn subscribe_events(&self, conn: &FleetConnection, robot_id: &str) -> Result<EventStream, FleetError>;
    
    /// Provider identifier
    fn provider_name(&self) -> &'static str;
    
    /// Supported robot types
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
    Custom(String),
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
```

### Fleet Adapter Implementations

```rust
// Formant Adapter
pub struct FormantAdapter {
    client: reqwest::Client,
    base_url: String,
    api_key: String,
}

impl FleetAdapter for FormantAdapter {
    fn provider_name(&self) -> &'static str { "formant" }
    
    async fn connect(&self, config: FleetConfig) -> Result<FleetConnection, FleetError> {
        // 1. Validate API key
        // 2. Test device list endpoint
        // 3. Return connection
    }
    
    async fn list_robots(&self, conn: &FleetConnection) -> Result<Vec<RobotInfo>, FleetError> {
        // GET /v1/devices
    }
    
    async fn get_telemetry(&self, conn: &FleetConnection, robot_id: &str) -> Result<TelemetryStream, FleetError> {
        // WebSocket: wss://api.formant.io/v1/devices/{id}/telemetry
    }
    
    async fn send_command(&self, conn: &FleetConnection, robot_id: &str, cmd: RobotCommand) -> Result<CommandResult, FleetError> {
        // POST /v1/devices/{id}/commands
    }
}

// ROS 2 Bridge Adapter (Generic)
pub struct ROS2BridgeAdapter {
    rosbridge_url: String,
    roslibpy_client: Option<RoslibpyClient>,
}

impl FleetAdapter for ROS2BridgeAdapter {
    fn provider_name(&self) -> &'static str { "ros2-bridge" }
    
    async fn connect(&self, config: FleetConfig) -> Result<FleetConnection, FleetError> {
        // 1. Connect to rosbridge WebSocket (ws://host:9090)
        // 2. Advertise topics
        // 3. Subscribe to /tf, /joint_states, /robot_description
    }
    
    async fn get_telemetry(&self, conn: &FleetConnection, robot_id: &str) -> Result<TelemetryStream, FleetError> {
        // Subscribe to /joint_states, /tf, camera topics
        // Return combined stream
    }
    
    async fn send_command(&self, conn: &FleetConnection, robot_id: &str, cmd: RobotCommand) -> Result<CommandResult, FleetError> {
        // Publish to /joint_trajectory_controller/joint_trajectory
        // or /cartesian_controller/target_frame
    }
}
```

---

## 4. TELEOP ADAPTER INTERFACE

### Core Trait (Rust)

```rust
// dirgha-core/src/teleop/trait.rs
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::ir::{Pose6D, TeleopConfig, TeleopSession, VideoStream, TeleopError};

#[async_trait]
pub trait TeleopAdapter: Send + Sync {
    /// Launch teleop session
    async fn launch(&self, config: TeleopConfig) -> Result<TeleopSession, TeleopError>;
    
    /// Send target pose from operator
    async fn send_pose(&self, session: &mut TeleopSession, pose: Pose6D) -> Result<(), TeleopError>;
    
    /// Send joint positions
    async fn send_joints(&self, session: &mut TeleopSession, joints: Vec<f32>) -> Result<(), TeleopError>;
    
    /// Get video stream from robot
    async fn get_video_stream(&self, session: &TeleopSession) -> Result<VideoStream, TeleopError>;
    
    /// Get robot state
    async fn get_robot_state(&self, session: &TeleopSession) -> Result<RobotState, TeleopError>;
    
    /// Emergency stop
    async fn emergency_stop(&self, session: &mut TeleopSession) -> Result<(), TeleopError>;
    
    /// Target latency in milliseconds
    fn latency_target_ms(&self) -> u32;
    
    /// Supports multi-robot supervision
    fn supports_multi_robot(&self) -> bool;
    
    /// Provider identifier
    fn provider_name(&self) -> &'static str;
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
    WebXR,      // Browser headset/phone
    WebRTC,     // Direct WebRTC
    ROS2,       // Native ROS 2 topics
    Gamepad,    // Gamepad/keyboard
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
    pub stream_url: String,  // WebRTC offer or MJPEG URL
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
pub struct SafetyConfig {
    pub e_stop_timeout_ms: u32,
    pub workspace_limits: WorkspaceLimits,
    pub collision_avoidance: bool,
    pub max_velocity: f32,
    pub max_acceleration: f32,
    pub lokahi_s2_approval_required: bool,
}
```

### Teleop Adapter Implementation (Your DEX ARM 01 Stack)

```rust
// WebXR Teleop Adapter (Your DEX ARM 01 Stack)
pub struct WebXRTeleopAdapter {
    signaling_server: SignalingServer,
    webrtc_manager: WebRTCManager,
    ros2_bridge: ROS2Bridge,
    pyroki_ik: Option<PyrokiIK>,
}

impl TeleopAdapter for WebXRTeleopAdapter {
    fn provider_name(&self) -> &'static str { "webxr-dex-arm" }
    
    fn latency_target_ms(&self) -> u32 { 50 }
    
    fn supports_multi_robot(&self) -> bool { true }
    
    async fn launch(&self, config: TeleopConfig) -> Result<TeleopSession, TeleopError> {
        // 1. Create WebRTC connection to robot (via signaling server)
        // 2. Establish ROS 2 bridge connection (rosbridge WebSocket)
        // 3. Initialize Pyroki IK solver for robot type
        // 4. Launch WebXR session (Three.js + WebXR + WebRTC)
        // 4. Return session with WebXR URL
    }
    
    async fn send_pose(&self, session: &mut TeleopSession, pose: Pose6D) -> Result<(), TeleopError> {
        // 1. Run Pyroki IK: pose → joint positions
        // 2. Send JointTrajectory via ROS 2 bridge
        // 3. Monitor execution
    }
    
    async fn get_video_stream(&self, session: &TeleopSession) -> Result<VideoStream, TeleopError> {
        // Return WebRTC video stream from robot cameras
    }
    
    async fn emergency_stop(&self, session: &mut TeleopSession) -> Result<(), TeleopError> {
        // Publish zero-velocity command + e-stop topic
    }
    
    fn supports_multi_robot(&self) -> bool { true }
    
    async fn supervise_fleet(&self, fleet_config: FleetTeleopConfig) -> Result<MultiRobotSession, TeleopError> {
        // Starship 1:20 model - one operator, N robots
        // Priority queue for interventions
    }
}

// Lokahi S2 Safety Envelope Check (Development aid, not certified safety function)
impl WebXRTeleopAdapter {
    pub fn validate_safety_envelope(&self, config: &TeleopConfig) -> Result<(), TeleopError> {
        if config.safety.lokahi_s2_approval_required {
            // Verify: Rule 14 Ahimsa 45s human approval signature + workspace/velocity bounds
        }
        Ok(())
    }
}
```

---

## 5. DIRGHA IR SCHEMA (Complete)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Dirgha IR",
  "type": "object",
  "required": ["robot", "task", "simulation", "brain"],
  "properties": {
    "robot": {
      "type": "object",
      "required": ["name", "description", "kinematics", "actuators", "sensors"],
      "properties": {
        "name": { "type": "string" },
        "description": { "type": "string" },
        "kinematics": { "$ref": "#/definitions/kinematics" },
        "actuators": { "type": "array", "items": { "$ref": "#/definitions/actuator" } },
        "sensors": { "type": "array", "items": { "$ref": "#/definitions/sensor" } }
      }
    },
    "task": {
      "type": "object",
      "required": ["name", "task_type", "objects", "success_criteria"],
      "properties": {
        "name": { "type": "string" },
        "task_type": { "enum": ["manipulation", "navigation", "inspection", "teleop", "custom"] },
        "objects": { "type": "array", "items": { "$ref": "#/definitions/object" } },
        "success_criteria": { "type": "array", "items": { "$ref": "#/definitions/success_criterion" } }
      }
    },
    "simulation": {
      "type": "object",
      "required": ["backend", "timestep", "headless"],
      "properties": {
        "backend": { "enum": ["mujoco-wasm", "mujoco-cpu", "gazebo", "isaac-sim", "isaac-sim-cloud", "genesis", "custom"] },
        "timestep": { "type": "number", "minimum": 0.0001, "maximum": 0.1 },
        "headless": { "type": "boolean" },
        "physics": { "$ref": "#/definitions/physics" },
        "rendering": { "$ref": "#/definitions/rendering" }
      }
    },
    "brain": {
      "type": "object",
      "required": ["provider", "model"],
      "properties": {
        "provider": { "type": "string" },
        "model": { "type": "string" },
        "inference": { "$ref": "#/definitions/inference_config" }
      }
    },
    "fleet": { "$ref": "#/definitions/fleet_spec" },
    "teleop": { "$ref": "#/definitions/teleop_spec" }
  },
  "definitions": {
    "kinematics": {
      "type": "object",
      "required": ["type", "dof"],
      "properties": {
        "type": { "enum": ["serial", "parallel", "humanoid", "mobile"] },
        "dof": { "type": "integer", "minimum": 1 },
        "base_link": { "type": "string" },
        "end_effector_link": { "type": "string" }
      }
    },
    "actuator": {
      "type": "object",
      "required": ["name", "type", "joint", "limits"],
      "properties": {
        "name": { "type": "string" },
        "type": { "enum": ["position", "velocity", "effort", "torque"] },
        "joint": { "type": "string" },
        "limits": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 }
      }
    },
    "sensor": {
      "type": "object",
      "required": ["name", "type"],
      "properties": {
        "name": { "type": "string" },
        "type": { "enum": ["camera", "depth", "lidar", "force_torque", "imu", "tactile", "joint_state"] },
        "frame_id": { "type": "string" },
        "rate": { "type": "number", "minimum": 0 }
      }
    },
    "object": {
      "type": "object",
      "required": ["name", "geometry", "size", "color"],
      "properties": {
        "name": { "type": "string" },
        "geometry": { "enum": ["box", "sphere", "cylinder", "mesh", "cube"] },
        "size": { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3 },
        "color": { "type": "string" },
        "pose": { "$ref": "#/definitions/pose6d" }
      }
    },
    "success_criterion": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": { "enum": ["grasp", "place", "reach", "trajectory", "custom"] },
        "object": { "type": "string" },
        "duration": { "type": "number", "minimum": 0 },
        "tolerance": { "type": "number", "minimum": 0 }
      }
    },
    "physics": {
      "type": "object",
      "properties": {
        "solver": { "enum": ["newton", "cg", "newton_mgs", "pgs"] },
        "iterations": { "type": "integer", "minimum": 1 },
        "gravity": { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3 }
      }
    },
    "rendering": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean" },
        "fps": { "type": "integer", "minimum": 1 },
        "resolution": { "type": "array", "items": { "type": "integer" }, "minItems": 2, "maxItems": 2 }
      }
    },
    "inference_config": {
      "type": "object",
      "properties": {
        "temperature": { "type": "number", "minimum": 0 },
        "top_k": { "type": "integer", "minimum": 1 },
        "deterministic": { "type": "boolean" },
        "chunk_size": { "type": "integer", "minimum": 1 }
      }
    },
    "pose6d": {
      "type": "object",
      "required": ["position", "orientation"],
      "properties": {
        "position": { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3 },
        "orientation": { "type": "array", "items": { "type": "number" }, "minItems": 4, "maxItems": 4 }
      }
    }
  }
}
```

---

## 6. API ENDPOINTS SUMMARY

### REST API (Dirgha Cloud)

```
POST   /api/v1/brain/infer          # Single inference
POST   /api/v1/brain/stream         # Streaming inference (SSE)
GET    /api/v1/brain/models         # List available models
POST   /api/v1/sim/launch           # Launch simulation
GET    /api/v1/sim/{id}/state       # Get simulation state
POST   /api/v1/sim/{id}/step        # Step simulation
GET    /api/v1/fleet/connect        # Connect to fleet
GET    /api/v1/fleet/robots         # List robots
WS     /api/v1/fleet/{id}/telemetry # Telemetry stream
POST   /api/v1/fleet/{id}/command   # Send command
WS     /api/v1/teleop/connect       # WebXR teleop WebSocket
POST   /api/v1/teleop/{id}/pose     # Send target pose
GET    /api/v1/teleop/{id}/video    # Video stream (WebRTC)
POST   /api/v1/data/collect         # Collect dataset
POST   /api/v1/data/export          # Export to HuggingFace
```

### CLI Commands

```
dirgha sim launch --robot <name> --scene <name> --backend <backend> [--headless]
dirgha sim load <path.mjcf|urdf|usd> [--convert-to-ir]
dirgha brain run --model <model> --task <task> --robot <robot> --sim <backend>
dirgha brain serve --model <model> --port <port>
dirgha brain providers list
dirgha fleet connect --provider <provider> --token <token>
dirgha fleet robots list
dirgha fleet robot <id> telemetry
dirgha fleet robot <id> command --type joint_position --positions "0.1,0.2,..."
dirgha teleop launch --robot <id> --fleet <provider> --mode webxr
dirgha teleop connect --robot <id> --mode webxr --latency-target 50
dirgha data collect --task <task> --episodes <n> --output <path>
dirgha plugin create --type <brain|sim|fleet|teleop> --name <name>
dirgha plugin publish --registry dirgha-hub
```

---

**END OF INTEGRATION SPECIFICATIONS**