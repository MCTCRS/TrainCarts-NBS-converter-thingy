import * as nbs from "https://esm.run/@nbsjs/core";
import * as yaml from "https://esm.run/js-yaml";

document.getElementById("convert-btn").addEventListener("click", convertButtonClicked);
document.getElementById("copy-btn").addEventListener("click", copyButtonClicked);
document.getElementById("output-type").addEventListener("input", outputType);
document.getElementById("upload-url").addEventListener("change", outputType);

let convertOuts = {}

function debugLog(message) {
    console.log("DEBUG: " + message);
}

function keyToPitchArray(key) {
    return Number(Math.pow(2, (key - 12) / 12).toFixed(5));
}

const soundFileToPlaysound = {
    "harp.ogg": "block.note_block.harp",
    "dbass.ogg": "block.note_block.bass",
    "bdrum.ogg": "block.note_block.basedrum",
    "sdrum.ogg": "block.note_block.snare",
    "click.ogg": "block.note_block.hat",
    "guitar.ogg": "block.note_block.guitar",
    "flute.ogg": "block.note_block.flute",
    "bell.ogg": "block.note_block.bell",
    "icechime.ogg": "block.note_block.chime",
    "xylobone.ogg": "block.note_block.xylophone",
    "iron_xylophone.ogg": "block.note_block.iron_xylophone",
    "cow_bell.ogg": "block.note_block.cow_bell",
    "didgeridoo.ogg": "block.note_block.didgeridoo",
    "bit.ogg": "block.note_block.bit",
    "banjo.ogg": "block.note_block.banjo",
    "pling.ogg": "block.note_block.pling"
};


async function convertButtonClicked() {
    try {
        debugLog("convert clicked");
        outputResult("");
        convertOuts = {};

        const input = document.getElementById("file-input");

        if (input.files.length !== 1) {
            alert("please select exactly one .nbs file");
            return;
        }

        const rawFile = input.files[0];

        if (!rawFile.name.toLowerCase().endsWith(".nbs")) {
            alert("file must be a .nbs file");
            return;
        }

        setState("reading file");
        const buf = await rawFile.arrayBuffer();
        const song = nbs.fromArrayBuffer(buf);

        setState("reading instruments");
        const instrumentsData = createInstrumentData(song.instruments.all);

        setState("reading notes");
        const audibleNotes = getAudibleNotes(song);

        setState("building song data");
        const songData = dataStructure(audibleNotes, song, instrumentsData);

        setState("building attachment");
        const out = toAttachment(songData, song);

        setState("");
        convertOuts.base = out;

        outputType();
    } catch(err) {
        alert("failed to convert file: " + err)
    } 
}



function copyButtonClicked() {
    document.getElementById("output").select();
    document.execCommand("copy");
}

function outputResult(text) {
    document.getElementById("output").value = text;
}

function setState(text) {
    document.getElementById("state").textContent = "          " + text;
}

async function outputType() {
    if (!convertOuts.base) return;
    const outputType = document.getElementById("output-type").value;
    const uploadasURL = document.getElementById("upload-url").checked;
    let out = ""
    
    if (outputType == "train") {
        if (uploadasURL) {
            out = await OutPut.train_url()
        } else {
            out = OutPut.train_yml()
        }
    } else {
        //attachment
        if (uploadasURL) {
            out = await OutPut.attachment_url()
        } else {
            out = OutPut.attachment_yml()
        }
    }

    outputResult(out);
}

class OutPut {
    static attachment_yml() {
        //return cache
        if ("attachment_yml" in convertOuts) return convertOuts.attachment_yml;
        convertOuts.attachment_yml = yaml.dump(convertOuts.base)
        return convertOuts.attachment_yml;
    }

    static train_yml() {
        //return cache
        if ("train_yml" in convertOuts) return convertOuts.train_yml;
        convertOuts.train_yml = yaml.dump(OutPut.wrapTrainObject(convertOuts.base))
        return convertOuts.train_yml;
    }

    static async attachment_url() {
        //return cache
        if ("attachment_url" in convertOuts) return convertOuts.attachment_url;
        convertOuts.attachment_url = await OutPut.upload(OutPut.attachment_yml());
        return convertOuts.attachment_url;
    }

    static async train_url() {
        //return cache
        if ("train_url" in convertOuts) return convertOuts.train_url;
        convertOuts.train_url = await OutPut.upload(OutPut.train_yml());
        return convertOuts.train_url;
    }

    static async upload(data) {
        let link;

        setState("      uploading...");

        try {
            const res = await fetch("https://paste.traincarts.net/documents", {
                method: "POST",
                headers: {
                    "Content-Type": "text/plain"
                },
                body: data
            });

            const json = await res.json();
            link = json.key;

        } catch (err) {
            console.error(err);
        }

        setState("");

        if (!link) {
            alert("failed to upload to traincarts");
            return "";
        }

        return "https://paste.traincarts.net/" + link;
    }


    static wrapTrainObject(attatchment) {
        return {
            carts: {
                0: {
                    model: {
                        type: "ENTITY",
                        entityType: "MINECART",
                        attachments: {
                            0: attatchment
                        },
                        editor: {
                            selectedIndex: 0
                        }
                    },
                    entityType: "MINECART",
                    flipped: false
                }
            }
        }
    }
}





function toAttachment(songData, song) {

    //SOUND ATTTACHMENT
    const soundAttachments = [];
    for (const key of Object.keys(songData)) {
        soundAttachments.push({
            type: "SOUND",
            sound: {
                key: key
            },
            names: [key]
        });
    }

    //SEQ ATTACHMENT
    const seqTimeConfig = {
        timeSignature: `${song.timeSignature}/4`,
        bpm: (song.getTempo() * 15),
        pitchClasses: 12
    }
    const seqEffects = [];
    for (const [key, data] of Object.entries(songData)) {
        for (const [key2, data2] of Object.entries(data)) {
            const seqEffectBase = {
                type: "MIDI",
                effect: key,
                config: {
                    ...seqTimeConfig,
                    notes: data2.map(a => `t=${a.time.toFixed(2)} s=${a.pitch}`)
                },
                volume: {
                    type: "CONSTANT",
                    output: +key2
                }
            }
            seqEffects.push(seqEffectBase)
        }
    }

    const seqAttachment = {
        type: "SEQUENCER",
        start: {
            duration: song.getDuration() / 1000,
            effects: seqEffects
        },
        attachments: Object.assign({}, [...soundAttachments])
    }

    //const allAttachment = Object.assign({},[seqAttachment]);
    return seqAttachment;
}


function getAudibleNotes(song) {

    //main filter
    const hasSoloLayer = song.layers.all.some(layer => layer.isSolo);
    const audibleLayers = song.layers.all.filter(layer =>
        !layer.isLocked &&
        layer.volume > 0 &&
        layer.notes.getTicks.length !== 0 &&
        (!hasSoloLayer || layer.isSolo)
    );

    //get max length tick
    let maxTick = 0;
    for (const layer of audibleLayers) {
        const ticks = layer.notes.getTicks;
        const lastTick = ticks[ticks.length - 1];
        if (lastTick > maxTick) maxTick = lastTick;
    }
    maxTick++;

    //foreach notes
    const out = []
    for (const layer of audibleLayers) {
        const notes = layer.notes;
        //for each note in layers
        notes.getTicks.forEach(tick => {
            const note = notes.all["" + tick];
            //make key object for pallet
            const noteObj = {
                key: note.key,
                instrument: note.instrument,
                volume: layer.volume,
                tick: tick
            }
            out.push(noteObj)
        })
    }
    return out;
}

function dataStructure(notes, song, insm) {
    const tempo = song.getTempo();
    const data = {}
    notes.sort((a, b) => a.tick - b.tick)
    for (const note of notes) {
        //get notedata
        const {
            key,
            instrument,
            volume,
            tick
        } = note;

        ((data["" + insm[instrument]] ??= {})["" + (volume / 100)] ??= []).push({
            time: tick / tempo,
            pitch: keyToPitchArray(key - 33)
        });
    }
    return data;
}

function createInstrumentData(instruments) {
    const out = [];
    for (const instrument of Object.values(instruments)) {
        let playsound;
        if (instrument.isBuiltIn) {
            playsound = soundFileToPlaysound[instrument.soundFile]
        } else {
            playsound = instrument.name
        }
        out.push(playsound);
    }
    return out;
}
