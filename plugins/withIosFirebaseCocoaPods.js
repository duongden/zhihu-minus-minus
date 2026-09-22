const { withPodfile } = require('@expo/config-plugins');
const {
  mergeContents,
} = require('@expo/config-plugins/build/utils/generateCode');

const TAG = '@react-native-firebase/app-disableSPM';
const ANCHOR = /prepare_react_native_project!/;
const FLAG = '$RNFirebaseDisableSPM = true';

module.exports = function withIosFirebaseCocoaPods(config) {
  return withPodfile(config, (podfileConfig) => {
    podfileConfig.modResults.contents = mergeContents({
      src: podfileConfig.modResults.contents,
      newSrc: FLAG,
      tag: TAG,
      anchor: ANCHOR,
      offset: 1,
      comment: '#',
    }).contents;
    return podfileConfig;
  });
};
