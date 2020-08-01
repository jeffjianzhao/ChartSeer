##################################################
## Modeling training scripts 
## This code is based on https://github.com/mkusner/grammarVAE
##################################################
## Author: Jian Zhao
## Contact: jeffjianzhao@gmail.com
##################################################

from __future__ import print_function

import argparse
import os
import h5py
import numpy as np

from model_vae import ModelVAE
from keras.callbacks import ModelCheckpoint, ReduceLROnPlateau, TensorBoard

MAX_LEN = 20
LATENT = 20
EPOCHS = 100
BATCH = 200

def get_arguments():
    params = {'hidden': 256, 'dense': 256, 'conv1': [8, 3], 'conv2': [8, 3], 'conv3': [8, 3]}

    parser = argparse.ArgumentParser(description='Vis autoencoder network')

    parser.add_argument('--epochs', type=int, metavar='N', default=EPOCHS)
    parser.add_argument('--latent', type=int, metavar='N', default=LATENT)
    parser.add_argument('--batch', type=int, metavar='N', default=BATCH)

    parser.add_argument('--hidden', type=int, metavar='N', default=params['hidden'])
    parser.add_argument('--dense', type=int, metavar='N', default=params['dense'])
    parser.add_argument('--conv1', type=int, metavar='N', nargs=2, default=params['conv1'])
    parser.add_argument('--conv2', type=int, metavar='N', nargs=2, default=params['conv2'])
    parser.add_argument('--conv3', type=int, metavar='N', nargs=2, default=params['conv3'])
    
    return parser.parse_args()

def main():
    # 0. load dataset and rules
    h5f = h5py.File('trainingdata/train.h5', 'r')
    data = h5f['data'][:]
    h5f.close()

    rules = []
    with open('trainingdata/rules-cfg-all.txt', 'r') as inputs:
        for line in inputs:
            line = line.strip()
            rules.append(line)

    # 1. get any arguments and define save file, then create the VAE model
    args = get_arguments()
    params = {'hidden': args.hidden, 'dense': args.dense, 'conv1': args.conv1, 'conv2': args.conv2, 'conv3': args.conv3}
    model_save = 'trained/vae_H%d_D%d_C%d%d%d_%d%d%d_L%d_B%d.hdf5' % (args.hidden, args.dense, args.conv1[0], args.conv2[0], args.conv3[0], args.conv1[1], args.conv2[1], args.conv3[1], args.latent, args.batch)
    model = ModelVAE()
    
    # 2. if this results file exists already load it
    if os.path.isfile(model_save):
        model.load(rules, model_save, latent_rep_size = args.latent, max_length = MAX_LEN, hypers = params)
    else:
        model.create(rules, latent_rep_size = args.latent, max_length = MAX_LEN, hypers = params)

    # 3. only save best model found on a 10% validation set
    checkpointer = ModelCheckpoint(filepath = model_save, verbose = 1, save_best_only = True)

    reduce_lr = ReduceLROnPlateau(monitor = 'val_loss', factor = 0.2, patience = 1, min_lr = 0.00001)

    # 4. fit the vae
    model.autoencoder.fit(
        data,
        data,
        shuffle = True,
        epochs = args.epochs,
        batch_size = BATCH,
        callbacks = [checkpointer, reduce_lr, TensorBoard(log_dir='/tmp/visgvae')],
        validation_split = 0.1
    )

if __name__ == '__main__':
    main()
