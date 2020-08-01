##################################################
## Utility functions
##################################################
## Author: Jian Zhao
## Contact: jeffjianzhao@gmail.com
##################################################

import simplejson as json
import os
import re
import nltk
import numpy as np
import h5py

import matplotlib.pyplot as plt
from sklearn.decomposition import PCA

from vis_vae import VisVAE, get_rules, get_specs
from vis_grammar import VisGrammar
from train import MAX_LEN

# extract CFG rules from the dataset
def extract_rules(inputfile, outputfile):
    specs = []
    with open(inputfile, 'r') as inputs:
        for line in inputs:
            try:
                specs.append(json.loads(line))
            except Exception as e:
                print(line, e)

    allrules = {}

    max_rulelen = 0
    for spec in specs:
        rules = []
        get_rules(spec, 'root', rules)
        for r in rules:
            if not r in allrules:
                allrules[r] = 0
            allrules[r] += 1
        max_rulelen = max(max_rulelen, len(rules))

    print('max len: %d' % max_rulelen)
    print(allrules)
    allrules = sorted(allrules.keys())
    allrules.append('Nothing -> None')

    with open(outputfile, 'w') as outf:
        for r in allrules:
            outf.write(r + '\n')

# generate the traning and testing datasets
def generate_datasets(inputfile, rulesfile, outputdir):
    data = []
    with open(inputfile, 'r') as inputs:
        for line in inputs:
            rules = []
            spec = json.loads(line)
            get_rules(spec, 'root', rules)
            data.append(rules)

    rules = []
    with open(rulesfile, 'r') as inputs:
        for line in inputs:
            line = line.strip()
            rules.append(line)
    print('number of rules: %d' % len(rules))

    rule2index = {}
    for i, r in enumerate(rules):
        rule2index[r] = i

    one_hot = np.zeros((len(data), MAX_LEN, len(rules)), dtype=np.float32)
    for i, sentence_rules in enumerate(data):
        indices = [rule2index[r] for r in sentence_rules]
        one_hot[i][np.arange(len(indices)), indices] = 1
        one_hot[i][np.arange(len(indices), MAX_LEN), -1] = 1

    split = int(0.1 * one_hot.shape[0])
    with h5py.File(outputdir + 'test.h5', 'w') as f:
        f.create_dataset('data', data=one_hot[0:split])
    
    with h5py.File(outputdir + 'train.h5', 'w') as f:
        f.create_dataset('data', data=one_hot[split:])
    
    with h5py.File(outputdir + 'dev.h5', 'w') as f:
        f.create_dataset('data', data=one_hot[0:1000])

# test the accuracy of the model
def test_vaemodel(rulesfile, modelsave, datafile):
    rules = []
    with open(rulesfile, 'r') as inputs:
        for line in inputs:
            line = line.strip()
            rules.append(line)

    m = re.search(r'_L(\d+)_', modelsave)
    visvae = VisVAE(modelsave, rules, MAX_LEN, int(m.group(1)))

    h5f = h5py.File(datafile, 'r')
    data = h5f['data'][:]
    h5f.close()
    print(data.shape)

    output = visvae.vae.autoencoder.predict(data)
    count = np.sum(np.equal(np.argmax(data, axis=2), np.argmax(output, axis=2)))
    print('accuracy: ', count / float(data.shape[0] * data.shape[1]))

    return output

# diplay the embeding space
def visualize_embedding(z, specs, figpath='./'):
    clr6 = ['#b3e2cd','#fdcdac','#cbd5e8','#f4cae4','#e6f5c9','#fff2ae']
    clr11 = ['#8dd3c7','#ffffb3','#bebada','#fb8072','#80b1d3','#fdb462','#b3de69','#fccde5','#d9d9d9','#bc80bd','#ccebc5']


    mark2int = {'area':0, 'bar':1, 'circle':2, 'line':3, 'point':4, 'tick':5}
    channel2int = {}
    channelmark2int = {}

    embeddings = np.load(z)
    channels = []
    marks = []
    channelmarks = []
    for s in specs:
        json_obj = json.loads(s)

        marks.append(clr6[mark2int[json_obj['mark']]])

        thischannel = []
        for k in json_obj['encoding']:
            thischannel.append(k)
        thischannel.sort()
        key = '-'.join(thischannel)
        if key not in channel2int:
            channel2int[key] = len(channel2int)
        channels.append(clr11[channel2int[key]])

        key = key + '-' + json_obj['mark']
        if key not in channelmark2int:
            channelmark2int[key] = len(channelmark2int)
        channelmarks.append(channelmark2int[key])

    results = PCA(n_components=2).fit_transform(embeddings)

    print('{0} unique channels'.format(len(channel2int)))
    print(mark2int)
    print('{0} unique channels+marks'.format(len(channelmark2int)))
    print(channel2int)

    plt.figure()
    plt.scatter(results[:, 0], results[:, 1], s=5, c=marks, alpha=0.7)
    plt.savefig(figpath + 'embedding-mark.pdf', bbox_inches='tight')

    plt.figure()
    plt.scatter(results[:, 0], results[:, 1], s=5, c=channels, alpha=0.7)
    plt.savefig(figpath + 'embedding-channel.pdf', bbox_inches='tight')

    plt.figure()
    plt.scatter(results[:, 0], results[:, 1], s=5, c=channelmarks, cmap='rainbow', alpha=0.7)
    cbar = plt.colorbar()
    plt.savefig(figpath + 'embedding-all.pdf', bbox_inches='tight')

# helper function to check the trained encoder and decoder
def test_visvae(inputspec, rulesfile, modelsave):
    rules = []
    with open(rulesfile, 'r') as inputs:
        for line in inputs:
            line = line.strip()
            rules.append(line)

    m = re.search(r'_L(\d+)_', modelsave)
    visvae = VisVAE(modelsave, rules, MAX_LEN, int(m.group(1)))
    
    # print(inputspec)
    z = visvae.encode(inputspec)
    # print(z)
    outputspec = visvae.decode(z)
    # print(outputspec)

    return outputspec,z

# helper function to check the CFG
def test_grammar(rulesfile):
    rules = []
    with open(rulesfile, 'r') as inputs:
        rules = inputs.read().split('\n')[:-1]

    grammar = VisGrammar(rules)
    print(grammar.GCFG.start())
    print(len(grammar.GCFG.productions()))

if __name__ == '__main__':
    os.chdir('gvae')

    ### Training Pipeline
    # follow the steps below to train and test the model by commenting and uncommenting the appropriate lines of code

    ## 0. preparation 
    # pip install -r requirements.txt
    # mkdir trainingdata
    # mkdir trained

    ## 1. build the CFG rules file
    extract_rules('../sourcedata/vegaspecs-processed.txt', 'trainingdata/rules-cfg.txt')

    ## 2. generate the traning and testing datasets
    generate_datasets('../sourcedata/vegaspecs-processed.txt', 'trainingdata/rules-cfg.txt', 'trainingdata/')

    ## 3. train the model: see train.py
    # e.g., python train.py --hidden 256 --dense 256 --conv1 8 3 --conv3 8 3 --conv3 8 3 --latent 20

    ## 4. test the model performance
    test_vaemodel('trainingdata/rules-cfg.txt', 'trained/vae_H256_D256_C444_333_L20_B200.hdf5', 'trainingdata/test.h5')

    
    
    ### Experimental Code (Optional)

    ## check if the CFG grammar works properly
    # test_grammar('trainingdata/rules-cfg.txt')

    ## check if the model works properly
    # inputspec = []
    # with open('../sourcedata/vegaspecs-processed.txt', 'r') as inputs:
    #     for line in inputs:
    #         line = line.strip()
    #         inputspec.append(line)
    # inputspec = inputspec[1000:1005]  # select 5 charts in the input to check the model output
    # outputspec, z = test_visvae(inputspec, 'trainingdata/rules-cfg.txt', 'trained/vae_H256_D256_C444_333_L2_B200.hdf5')
    # with open('results.json', 'w') as outputs:
    #     outputs.write('{"input": [' + ','.join(inputspec) + '],')
    #     outputs.write('"output": [' + ','.join(outputspec) + ']}')

    ## visualize the embedding space
    # np.save('embeddings.npy', z)
    # visualize_embedding('embeddings.npy', inputspec, './')