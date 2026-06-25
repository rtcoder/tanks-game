import * as THREE from 'three';

type PhysXFactory = typeof import('physx-js-webidl').default;
type PhysXRuntime = Awaited<ReturnType<PhysXFactory>>;
type PhysXActor = ReturnType<PhysXRuntime['CreateDynamic']>;
type PhysXFixedJoint = ReturnType<PhysXRuntime['FixedJointCreate']>;

export type PhysXDynamicBoxHandle = {
  id: string;
  mesh: THREE.Object3D;
  actor: PhysXActor;
  age: number;
  maxAge: number;
};

export type PhysXDynamicBoxOptions = {
  id: string;
  mesh: THREE.Object3D;
  size: THREE.Vector3;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  mass: number;
  linearVelocity?: THREE.Vector3;
  angularVelocity?: THREE.Vector3;
  maxAge?: number;
};

export class PhysXWorld {
  private readonly handles = new Map<string, PhysXDynamicBoxHandle>();
  private readonly px: PhysXRuntime;
  private readonly foundation: unknown;
  private readonly physics: ReturnType<PhysXRuntime['CreatePhysics']>;
  private readonly scene: ReturnType<ReturnType<PhysXRuntime['CreatePhysics']>['createScene']>;
  private readonly material: ReturnType<ReturnType<PhysXRuntime['CreatePhysics']>['createMaterial']>;
  private readonly dispatcher: ReturnType<PhysXRuntime['DefaultCpuDispatcherCreate']>;
  private readonly fixedJoints = new Map<string, PhysXFixedJoint>();
  private readonly staticActors: unknown[] = [];
  private disposed = false;

  private constructor(
      px: PhysXRuntime,
      foundation: unknown,
      physics: ReturnType<PhysXRuntime['CreatePhysics']>,
      scene: ReturnType<ReturnType<PhysXRuntime['CreatePhysics']>['createScene']>,
      material: ReturnType<ReturnType<PhysXRuntime['CreatePhysics']>['createMaterial']>,
      dispatcher: ReturnType<PhysXRuntime['DefaultCpuDispatcherCreate']>,
  ) {
    this.px = px;
    this.foundation = foundation;
    this.physics = physics;
    this.scene = scene;
    this.material = material;
    this.dispatcher = dispatcher;
  }

  static async create(): Promise<PhysXWorld | null> {
    if (typeof window === 'undefined' || typeof WebAssembly === 'undefined') {
      return null;
    }

    try {
      const {default: createPhysX} = await import('physx-js-webidl');
      const px = await createPhysX();
      const allocator = new px.PxDefaultAllocator();
      const errorCallback = new px.PxDefaultErrorCallback();
      const foundation = px.CreateFoundation(px.PHYSICS_VERSION, allocator, errorCallback);
      const scale = new px.PxTolerancesScale();
      scale.length = 100;
      scale.speed = 981;
      const physics = px.CreatePhysics(px.PHYSICS_VERSION, foundation, scale);
      px.InitExtensions(physics);

      const sceneDesc = new px.PxSceneDesc(scale);
      sceneDesc.gravity = new px.PxVec3(0, 0, -981);
      const dispatcher = px.DefaultCpuDispatcherCreate(0);
      sceneDesc.cpuDispatcher = dispatcher;
      sceneDesc.filterShader = px.DefaultFilterShader();
      const scene = physics.createScene(sceneDesc);
      const material = physics.createMaterial(0.72, 0.62, 0.08);
      const world = new PhysXWorld(px, foundation, physics, scene, material, dispatcher);
      world.addGroundPlane(0);

      return world;
    } catch (error) {
      console.warn('PhysX WASM unavailable; falling back to lightweight debris physics.', error);
      return null;
    }
  }

  addGroundPlane(z: number): void {
    if (this.disposed) {
      return;
    }

    const plane = this.px.CreatePlane(this.physics, new this.px.PxPlane(0, 0, 1, -z), this.material);
    this.scene.addActor(plane);
    this.staticActors.push(plane);
  }

  createDynamicBox(options: PhysXDynamicBoxOptions): PhysXDynamicBoxHandle | null {
    if (this.disposed || this.handles.has(options.id)) {
      return null;
    }

    const half = options.size.clone().multiplyScalar(0.5);
    const geometry = new this.px.PxBoxGeometry(
        Math.max(0.5, half.x),
        Math.max(0.5, half.y),
        Math.max(0.5, half.z),
    );
    const actor = this.px.CreateDynamic(
        this.physics,
        this.transformFromThree(options.position, options.quaternion),
        geometry,
        this.material,
        1,
    );
    this.setBoxMassAndInertia(actor, Math.max(0.1, options.mass), options.size);
    actor.setLinearDamping(0.08);
    actor.setAngularDamping(0.18);
    actor.setMaxLinearVelocity(1800);
    actor.setMaxAngularVelocity(18);
    if (options.linearVelocity) {
      actor.setLinearVelocity(this.vec3(options.linearVelocity), true);
    }
    if (options.angularVelocity) {
      actor.setAngularVelocity(this.vec3(options.angularVelocity), true);
    }

    this.scene.addActor(actor);
    const handle: PhysXDynamicBoxHandle = {
      id: options.id,
      mesh: options.mesh,
      actor,
      age: 0,
      maxAge: options.maxAge ?? 12,
    };
    this.handles.set(handle.id, handle);
    this.px.destroy(geometry);

    return handle;
  }

  step(delta: number): void {
    if (this.disposed || this.handles.size === 0) {
      return;
    }

    const step = Math.min(delta, 1 / 30);
    this.scene.simulate(step);
    this.scene.fetchResults(true);

    this.handles.forEach((handle) => {
      handle.age += step;
      const pose = handle.actor.getGlobalPose();
      handle.mesh.position.set(pose.p.x, pose.p.y, pose.p.z);
      handle.mesh.quaternion.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w);
    });
  }

  releaseDynamicBox(id: string): void {
    const handle = this.handles.get(id);
    if (!handle) {
      return;
    }

    this.scene.removeActor(handle.actor);
    handle.actor.release();
    this.handles.delete(id);
  }

  createFixedJoint(
      id: string,
      firstId: string,
      secondId: string,
      breakForce: number,
      breakTorque: number,
  ): boolean {
    if (this.disposed || this.fixedJoints.has(id)) {
      return false;
    }

    const first = this.handles.get(firstId);
    const second = this.handles.get(secondId);
    if (!first || !second) {
      return false;
    }

    const localFrame = new this.px.PxTransform(this.px.PxIDENTITYEnum.PxIdentity);
    const joint = this.px.FixedJointCreate(this.physics, first.actor, localFrame, second.actor, localFrame);
    joint.setBreakForce(breakForce, breakTorque);
    this.fixedJoints.set(id, joint);

    return true;
  }

  releaseFixedJoint(id: string): void {
    const joint = this.fixedJoints.get(id);
    if (!joint) {
      return;
    }

    joint.release();
    this.fixedJoints.delete(id);
  }

  releaseExpired(onExpire: (handle: PhysXDynamicBoxHandle, opacity: number) => boolean): void {
    this.handles.forEach((handle) => {
      if (handle.age <= handle.maxAge) {
        return;
      }
      const fade = Math.max(0, 1 - (handle.age - handle.maxAge) / 1.6);
      if (onExpire(handle, fade) || fade <= 0) {
        this.releaseDynamicBox(handle.id);
      }
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    Array.from(this.fixedJoints.keys()).forEach((id) => this.releaseFixedJoint(id));
    Array.from(this.handles.keys()).forEach((id) => this.releaseDynamicBox(id));
    this.staticActors.forEach((actor) => {
      const releasable = actor as { release?: () => void };
      releasable.release?.();
    });
    this.staticActors.length = 0;
    this.material.release();
    this.scene.release();
    this.physics.release();
    const dispatcher = this.dispatcher as { release?: () => void };
    dispatcher.release?.();
    const foundation = this.foundation as { release?: () => void };
    foundation.release?.();
    this.disposed = true;
  }

  private transformFromThree(position: THREE.Vector3, quaternion: THREE.Quaternion): InstanceType<PhysXRuntime['PxTransform']> {
    return new this.px.PxTransform(
        this.vec3(position),
        new this.px.PxQuat(quaternion.x, quaternion.y, quaternion.z, quaternion.w),
    );
  }

  private vec3(vector: THREE.Vector3): InstanceType<PhysXRuntime['PxVec3']> {
    return new this.px.PxVec3(vector.x, vector.y, vector.z);
  }

  private setBoxMassAndInertia(actor: PhysXActor, mass: number, size: THREE.Vector3): void {
    const rigidBodyExt = this.px.PxRigidBodyExt as unknown as {
      prototype?: {
        setMassAndUpdateInertia?: (body: PhysXActor, mass: number) => boolean;
      };
    };
    if (rigidBodyExt.prototype?.setMassAndUpdateInertia?.(actor, mass)) {
      return;
    }

    actor.setMass(mass);
    actor.setMassSpaceInertiaTensor(new this.px.PxVec3(
        mass * (size.y * size.y + size.z * size.z) / 12,
        mass * (size.x * size.x + size.z * size.z) / 12,
        mass * (size.x * size.x + size.y * size.y) / 12,
    ));
  }
}
