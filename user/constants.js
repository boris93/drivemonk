module.exports = {
    AUDIO_INPUT_SAMPLE_RATE: 20000,
    AUDIO_INPUT_ENCODING: 'unsigned',
    AUDIO_INPUT_BITS: 16,
    AUDIO_INPUT_CHANNELS: 1,
    AUDIO_INPUT_FILE_TYPE: 'raw',
    AUDIO_OUTPUT_SAMPLE_RATE: 16000,
    AUDIO_OUTPUT_ENCODING: 'signed',
    AUDIO_OUTPUT_BITS: 16,
    AUDIO_OUTPUT_CHANNELS: 1,
    AUDIO_OUTPUT_FILE_TYPE: 'wav',
    OPUS_FRAME_SIZE: 16000 / 50,
    streamHeader: {
        STREAM_IDENTIFIER_POS: 0,
        CONTENT_LENGTH_POS: 2,
        CONTENT_POS: 4,
        streamIdentifiers: {
            AUDIO: 0xf90c,
            CONTROL: 0xe169
        },
        CONTROL_CHARACTER_LENGTH: 2,
        controlCharacters: {
            INIT: 0xffff, // Rec
            END: 0xfffe, // Rec
            PLAY_PAUSE_TOGGLE: 0xfffd, // Player
            NEXT_SONG: 0xfffc, // Player
            TIMEOUT: 0xffdf // Rec
        }
    },
    microphoneResponse: {
        PROCEED_WITH_RECORDING: 0x0001,
        FAILED_TO_INITIATE_RECORDING: 0x0000,
        REQUEST_PROCESSING_SUCCESS: 0x0003,
        REQUEST_PROCESSING_FAILURE: 0x0002
    },
    SONGS_CACHE_HEADER_DIR: 'songsCache/fileHeader/',
    SONGS_CACHE_CONTENT_DIR: 'songsCache/fileContent/',
    PLAYED_SONG_INFO_UPDATE_ENDPOINT: 'http://api.musicmonk.in/updatePlayedSongInfo.php',
    RECOMMENDER_ENDPOINT: 'http://api.musicmonk.in/recommender.php',
    SEARCH_ENDPOINT: 'http://api.musicmonk.in/search.php'
};
