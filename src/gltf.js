import { gltfAccessor } from './accessor.js';
import { gltfBuffer } from './buffer.js';
import { gltfBufferView } from './buffer_view.js';
import { gltfCamera } from './camera.js';
import { gltfImage } from './image.js';
import { gltfLight } from './light.js';
import { gltfMaterial } from './material.js';
import { gltfMesh } from './mesh.js';
import { gltfNode } from './node.js';
import { gltfSampler } from './sampler.js';
import { gltfScene } from './scene.js';
import { gltfTexture } from './texture.js';
import { getContainingFolder, initGlForMembers, objectsFromJsons, objectFromJson } from './utils';
import { gltfAsset } from './asset.js';

class glTF
{
    constructor(file)
    {
        this.asset = new gltfAsset();
        this.accessors = [];
        this.nodes = [];
        this.scene = undefined; // the default scene to show.
        this.scenes = [];
        this.cameras = [];
        this.lights = [];
        this.textures = [];
        this.images = [];
        this.samplers = [];
        this.meshes = [];
        this.buffers = [];
        this.bufferViews = [];
        this.materials = [];
        this.path = file;
    }

    initGl(gltf)
    {
        initGlForMembers(this, gltf);
    }

    fromJson(json)
    {
        this.asset = objectFromJson(json.asset, gltfAsset);
        this.cameras = objectsFromJsons(json.cameras, gltfCamera);
        this.accessors = objectsFromJsons(json.accessors, gltfAccessor);
        this.meshes = objectsFromJsons(json.meshes, gltfMesh);
        this.samplers = objectsFromJsons(json.samplers, gltfSampler);
        this.materials = objectsFromJsons(json.materials, gltfMaterial);
        this.buffers = objectsFromJsons(json.buffers, gltfBuffer);
        this.bufferViews = objectsFromJsons(json.bufferViews, gltfBufferView);
        this.scenes = objectsFromJsons(json.scenes, gltfScene);
        this.textures = objectsFromJsons(json.textures, gltfTexture);
        this.nodes = objectsFromJsons(json.nodes, gltfNode);
        this.lights = objectsFromJsons(getJsonLightsFromExtensions(json.extensions), gltfLight);
        this.images = objectsFromJsons(json.images, gltfImage);

        this.materials.push(gltfMaterial.createDefault());
        this.samplers.push(gltfSampler.createDefault());

        this.addNodeReferences();

        if (json.scenes !== undefined)
        {
            if (json.scene === undefined && json.scenes.length > 0)
            {
                this.scene = 0;
            }
            else
            {
                this.scene = json.scene;
            }
        }
    }

    addNodeReferences()
    {
        for (let i = 0; i < this.nodes.length; ++i)
        {
            const node = this.nodes[i];
            if(node.camera !== undefined)
            {
                this.cameras[node.camera].node = i;
            }

            if(node.extensions !== undefined)
            {
                if (node.extensions.KHR_lights_punctual !== undefined)
                {
                    this.lights[node.extensions.KHR_lights_punctual.light].node = i;
                }
            }
        }
    }
}

function getJsonLightsFromExtensions(extensions)
{
    if (extensions === undefined)
    {
        return [];
    }
    if (extensions.KHR_lights_punctual === undefined)
    {
        return [];
    }
    return extensions.KHR_lights_punctual.lights;
}

export { glTF };
