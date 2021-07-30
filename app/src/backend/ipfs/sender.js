import watch from 'file-watch-iterator';
import { ipfsMkdir, ipfsAddFile, contentID, ipfsRm, publish } from "../../network/ipfsConnector.js";
import { join } from "path";
import { existsSync, mkdirSync } from 'fs';
import Debug from 'debug';
import { sortBy, reverse } from "ramda";

const debug = Debug("ipfs/sender");

export const sender = async ({ path: watchPath, debounce, ipns, once }) => {
  if (!existsSync(watchPath)) {
    debug("Local: Root directory does not exist. Creating", watchPath);
    mkdirSync(watchPath, { recursive: true });
  }
  await ipfsMkdir("/");
  debug("IPFS: Created root IPFS path (if it did not exist)");
  debug("Local: Watching", watchPath);
  const watch$ = watch(".", {
    ignored: /(^|[\/\\])\../,
    cwd: watchPath,
    awaitWriteFinish: true,
  }, { debounce });

  for await (const files of watch$) {

    const changed = getSortedChangedFiles(files);
    await Promise.all(changed.map(async ({ event, file }) => {
      const localPath = join(watchPath, file);
      const ipfsPath = file;

      if (event === "addDir") {
        await ipfsMkdir(ipfsPath);
      }

      if (event === "add") {
        await ipfsAddFile(ipfsPath, localPath);
      }

      if (event === "unlink" || event === "unlinkDir") {
        debug("removing", file, event);
        await ipfsRm(ipfsPath);
      }

      if (event === "change") {
        debug("changing", file);
        await ipfsAddFile(ipfsPath, localPath);
      }
    }));
    // for (const { event, file } of changed) {
    // }
    // console.error("PUBLISHIIING")
    const newContentID = await contentID("/");
    console.log(newContentID);
    if (ipns) {
      debug("publish", newContentID);
      // if (!isSameContentID(stringCID(newContentID)))
      await publish(newContentID);
    }

    if (once) {
      break;
    }
  }

};



function getSortedChangedFiles(files) {
  const changed = files.toArray()
    .filter(({ changed, file }) => changed && file.length > 0)
    .map(({ changed, ...rest }) => rest);
  const changedOrdered = order(changed);
  debug("Changed files", changedOrdered);
  return changedOrdered;
}


// TODO: check why unlink is twice in ordering
const _eventOrder = ["unlink", "addDir", "add", "unlink", "unlinkDir"];//.reverse();
const eventOrder = ({ event }) => _eventOrder.indexOf(event);

const order = events => sortBy(eventOrder, reverse(events));