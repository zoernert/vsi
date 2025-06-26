class DIContainer {
  constructor() {
    this.dependencies = new Map();
    this.instances = new Map();
  }

  register(name, factory, options = {}) {
    const { singleton = true, dependencies = [] } = options;
    
    this.dependencies.set(name, {
      factory,
      singleton,
      dependencies,
      instance: null
    });
    
    return this;
  }

  resolve(name) {
    // Return existing singleton instance
    if (this.instances.has(name)) {
      return this.instances.get(name);
    }

    const dependency = this.dependencies.get(name);
    if (!dependency) {
      throw new Error(`Dependency '${name}' not found. Available dependencies: ${Array.from(this.dependencies.keys()).join(', ')}`);
    }

    // Resolve dependencies first
    const resolvedDependencies = dependency.dependencies.map(dep => this.resolve(dep));

    // Create instance
    const instance = dependency.factory(this, ...resolvedDependencies);

    // Cache singleton instances
    if (dependency.singleton) {
      this.instances.set(name, instance);
    }

    return instance;
  }

  has(name) {
    return this.dependencies.has(name);
  }

  clear() {
    this.dependencies.clear();
    this.instances.clear();
  }

  registerValue(name, value) {
    this.instances.set(name, value);
    return this;
  }

  // Register a class constructor
  registerClass(name, ClassConstructor, options = {}) {
    return this.register(name, (container, ...deps) => {
      return new ClassConstructor(...deps);
    }, options);
  }

  // Register a factory function
  registerFactory(name, factoryFn, options = {}) {
    return this.register(name, factoryFn, options);
  }
}

module.exports = DIContainer;
