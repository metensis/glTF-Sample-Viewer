import { initGlForMembers } from './utils.js';
import { WebGl } from './webgl.js';
import { GltfObject } from './gltf_object.js';
import { DracoDecoder } from './draco.js';
import { gltfBuffer } from './buffer.js';
import { gltfBufferView } from './buffer_view.js';

class gltfPrimitive extends GltfObject
{
    constructor()
    {
        super();
        this.attributes = [];
        this.targets = [];
        this.indices = undefined;
        this.material = undefined;
        this.mode = WebGl.context.TRIANGLES;

        // non gltf
        this.glAttributes = [];
        this.defines = [];
        this.skip = true;
        this.hasWeights = false;
        this.hasJoints = false;

        // The primitive centroid is used for depth sorting.
        this.centroid = undefined;
    }

    initGl(gltf)
    {
        // Use the default glTF material.
        if (this.material === undefined)
        {
            this.material = gltf.materials.length - 1;
        }

        initGlForMembers(this, gltf);

        const maxAttributes = WebGl.context.getParameter(WebGl.context.MAX_VERTEX_ATTRIBS);

        // https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#meshes

        if (this.extensions !== undefined)
        {
            if (this.extensions.KHR_draco_mesh_compression !== undefined)
            {
                this.decodeDraco(this.attributes, this.extensions.KHR_draco_mesh_compression, gltf);
            }
        }

        // VERTEX ATTRIBUTES
        for (const attribute of Object.keys(this.attributes))
        {
            if(this.glAttributes.length >= maxAttributes)
            {
                console.error("To many vertex attributes for this primitive, skipping " + attribute);
                break;
            }

            const idx = this.attributes[attribute];
            switch (attribute)
            {
            case "POSITION":
                this.skip = false;
                this.glAttributes.push({ attribute: attribute, name: "a_Position", accessor: idx });
                break;
            case "NORMAL":
                this.defines.push("HAS_NORMALS 1");
                this.glAttributes.push({ attribute: attribute, name: "a_Normal", accessor: idx });
                break;
            case "TANGENT":
                this.defines.push("HAS_TANGENTS 1");
                this.glAttributes.push({ attribute: attribute, name: "a_Tangent", accessor: idx });
                break;
            case "TEXCOORD_0":
                this.defines.push("HAS_UV_SET1 1");
                this.glAttributes.push({ attribute: attribute, name: "a_UV1", accessor: idx });
                break;
            case "TEXCOORD_1":
                this.defines.push("HAS_UV_SET2 1");
                this.glAttributes.push({ attribute: attribute, name: "a_UV2", accessor: idx });
                break;
            case "COLOR_0":
                {
                    const accessor = gltf.accessors[idx];
                    this.defines.push("HAS_VERTEX_COLOR_" + accessor.type + " 1");
                    this.glAttributes.push({ attribute: attribute, name: "a_Color", accessor: idx });
                }
                break;
            case "JOINTS_0":
                this.hasJoints = true;
                this.defines.push("HAS_JOINT_SET1 1");
                this.glAttributes.push({ attribute: attribute, name: "a_Joint1", accessor: idx });
                break;
            case "WEIGHTS_0":
                this.hasWeights = true;
                this.defines.push("HAS_WEIGHT_SET1 1");
                this.glAttributes.push({ attribute: attribute, name: "a_Weight1", accessor: idx });
                break;
            case "JOINTS_1":
                this.hasJoints = true;
                this.defines.push("HAS_JOINT_SET2 1");
                this.glAttributes.push({ attribute: attribute, name: "a_Joint2", accessor: idx });
                break;
            case "WEIGHTS_1":
                this.hasWeights = true;
                this.defines.push("HAS_WEIGHT_SET2 1");
                this.glAttributes.push({ attribute: attribute, name: "a_Weight2", accessor: idx });
                break;
            default:
                console.log("Unknown attribute: " + attribute);
            }
        }

        // MORPH TARGETS
        if (this.targets !== undefined)
        {
            let i = 0;
            for (const target of this.targets)
            {
                if(this.glAttributes.length + 3 > maxAttributes)
                {
                    console.error("To many vertex attributes for this primitive, skipping target " + i);
                    break;
                }

                for (const attribute of Object.keys(target))
                {
                    const idx = target[attribute];

                    switch (attribute)
                    {
                    case "POSITION":
                        this.defines.push("HAS_TARGET_POSITION" + i + " 1");
                        this.glAttributes.push({ attribute: attribute, name: "a_Target_Position" + i, accessor: idx });
                        break;
                    case "NORMAL":
                        this.defines.push("HAS_TARGET_NORMAL" + i + " 1");
                        this.glAttributes.push({ attribute: attribute, name: "a_Target_Normal" + i, accessor: idx });
                        break;
                    case "TANGENT":
                        this.defines.push("HAS_TARGET_TANGENT" + i + " 1");
                        this.glAttributes.push({ attribute: attribute, name: "a_Target_Tangent" + i, accessor: idx });
                        break;
                    }
                }

                ++i;
            }
        }
    }

    getShaderIdentifier()
    {
        return "primitive.vert";
    }

    getDefines()
    {
        return this.defines;
    }

    setCentroid(centroid)
    {
        this.centroid = centroid;
    }

    decodeDraco(attributes, dracoExtension, gltf)
    {
        let dracoBufferViewIDX = dracoExtension.bufferView;
        let dracoAttributes = dracoExtension.attributes;

        let dracoPositionID = dracoAttributes["POSITION"];

        // Create the Draco decoder.
        const decoderModule = gltf.dracoDecoder.module;

        const bufferView = gltf.bufferViews[dracoBufferViewIDX];
        const buffer = gltf.buffers[bufferView.buffer];
        const bufferArray = new Uint8Array(buffer.buffer, bufferView.byteOffset, bufferView.byteLength);

        const dracoBuffer = new decoderModule.DecoderBuffer();
        dracoBuffer.Init(bufferArray, bufferArray.byteLength);

        // Create a buffer to hold the encoded data.
        const decoder = new decoderModule.Decoder();
        const geometryType = decoder.GetEncodedGeometryType(dracoBuffer);

        // Decode the encoded geometry.
        let outputGeometry;
        let status;
        if (geometryType == decoderModule.TRIANGULAR_MESH) {
            outputGeometry = new decoderModule.Mesh();
            status = decoder.DecodeBufferToMesh(dracoBuffer, outputGeometry);
        }

        if (status.ok() === false)
        {
            return false;
        }

        const positionAttribute = decoder.GetAttribute(outputGeometry, decoderModule.POSITION);
        const positionDracoBuffer = new decoderModule.DracoFloat32Array();
        if (!decoder.GetAttributeFloatForAllPoints(outputGeometry, positionAttribute, positionDracoBuffer))
        {
            return false;
        }

        const positionBuffer = new Uint8Array(positionDracoBuffer.size() * 4);
        for (let i = 0; i < positionDracoBuffer.size(); i++)
        {
            const dracoFloat = new Float32Array(1);
            dracoFloat[0] = positionDracoBuffer.GetValue(i);
            const bytes = new Uint8Array(dracoFloat, 0, 4);
            positionBuffer[4 * i + 0] = bytes[0];
            positionBuffer[4 * i + 1] = bytes[1];
            positionBuffer[4 * i + 2] = bytes[2];
            positionBuffer[4 * i + 3] = bytes[3];
        }

        const positionGltfBuffer = new gltfBuffer();
        positionGltfBuffer.byteLength = positionBuffer.length;
        positionGltfBuffer.buffer = positionBuffer;
        gltf.buffers.push(positionGltfBuffer);

        const positionGltfBufferView = new gltfBufferView();
        positionGltfBufferView.buffer = gltf.buffers.length - 1;
        positionGltfBufferView.byteLength = positionBuffer.length;
        gltf.bufferViews.push(positionGltfBufferView);

        gltf.accessors[attributes["POSITION"]].byteOffset = 0;
        gltf.accessors[attributes["POSITION"]].bufferView = gltf.bufferViews.length - 1;

        // You must explicitly delete objects created from the DracoDecoderModule
        // or Decoder.
        decoderModule.destroy(outputGeometry);
        decoderModule.destroy(decoder);
        decoderModule.destroy(buffer);

        return true;
    }
}

export { gltfPrimitive };

