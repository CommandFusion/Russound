# Russound Control via CommandFusion 

This project allows for control of Russound hardware via Ethernet using CommandFusion software.  
Currently, only C-Series hardware has been tested.

The project is split into 2 parts:

1. [iViewer JavaScript file](#js)
1. [CF iViewer Project](#iviewer)

### <a name="js" />iViewer JavaScript File
We have developed a [JavaScript file][jsfile] for iViewer that handles all the Ethernet communication with Russound.

### <a name="iviewer" />CF iViewer Project
To go along with the [JavaScript file][jsfile], we have created a sample [iViewer project][guifile].  
This project should be used as a reference on how to call the JavaScript functions in your own project and how to setup the System Properties.

## More Information
See the [wiki] for more information.

[wiki]: http://github.com/CommandFusion/Russound/wiki
[jsfile]: https://github.com/CommandFusion/Russound/blob/master/GUI/russound.js
[guifile]: https://github.com/CommandFusion/Russound/blob/master/GUI/russound.gui