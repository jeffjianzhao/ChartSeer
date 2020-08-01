##################################################
## Wrapper for VegaLite visualizations
## This code is based on https://github.com/mkusner/grammarVAE
##################################################
## Author: Jian Zhao
## Contact: jeffjianzhao@gmail.com
##################################################

import simplejson as json
import re
import numpy as np
import nltk

from model_vae import ModelVAE
from vis_grammar import VisGrammar

def get_rules(node, parentkey, rules):
    thisrule = parentkey + ' -> ' + ' "+" '.join(sorted(node.keys()))
    rules.append(thisrule)

    for k in sorted(node.keys()):
        v = node[k]
        if type(v) is dict:
            get_rules(v, k, rules)
        else:
            rules.append(k + ' -> ' + '"' + str(v) + '"')

def get_specs(rules):
    spectree = {'name':'root', 'parent':None}
    Q = [spectree]

    for r in rules:  
        for node in filter(lambda x: x['name'] == str(r.lhs()), Q):
            for symbol in r.rhs():
                symbol_name = str(symbol)
                if type(symbol) == nltk.grammar.Nonterminal:
                    node[symbol_name] = {'name':symbol_name, 'parent':node}
                    Q.append(node[symbol_name])
                elif symbol_name != '+':
                    if symbol_name == 'True':
                        node['parent'][node['name']] = True
                    elif symbol_name == 'False':
                        node['parent'][node['name']] = False
                    else:
                        try:
                            node['parent'][node['name']] = float(symbol_name)
                        except:
                            node['parent'][node['name']] = symbol_name
    
    clean_tree(Q[0])
    return json.dumps(Q[0])    

def clean_tree(node):
    del node['parent']
    del node['name']

    for k, v in node.items():
        if type(v) is dict:
            clean_tree(v)

class VisVAE():
    def __init__(self, weights_file, rules, max_len, latent_dim):
        self.rules = rules
        self.max_len = max_len
        self.input_dim = len(rules)
        self.latent_dim = latent_dim

        self.rule2index = {}
        for i, r in enumerate(rules):
            self.rule2index[r] = i

        self.grammar = VisGrammar(rules)
        self.productions = self.grammar.GCFG.productions()
        self.lhs_map = {}
        for ix, lhs in enumerate(self.grammar.lhs_list):
            self.lhs_map[lhs] = ix

        hypers = self._get_hypers(weights_file)
        self.vae = ModelVAE()
        self.vae.load(self.rules, weights_file, max_length=self.max_len, latent_rep_size=self.latent_dim, hypers=hypers)

    def encode(self, sentences):
        one_hot = np.zeros((len(sentences), self.max_len, self.input_dim), dtype=np.float32)

        for i, sentence in enumerate(sentences):
            json_obj = json.loads(sentence)
            sentence_rules = [] 
            get_rules(json_obj, 'root', sentence_rules)
            indices = [self.rule2index[r] for r in sentence_rules]

            one_hot[i][np.arange(len(indices)), indices] = 1
            one_hot[i][np.arange(len(indices), self.max_len), -1] = 1

        self.one_hot = one_hot
        return self.vae.encoderMV.predict(one_hot)[0]

    def decode(self, z):
        assert z.ndim == 2
        unmasked = self.vae.decoder.predict(z)
        X_hat = self._sample_using_masks(unmasked)

        # Convert from one-hot to sequence of production rules
        prod_seq = [[self.productions[X_hat[index, t].argmax()] for t in range(X_hat.shape[1])] 
            for index in range(X_hat.shape[0])]
        return [get_specs(prods) for prods in prod_seq]

    def _sample_using_masks(self, unmasked):
        eps = 1e-100
        X_hat = np.zeros_like(unmasked)

        # Create a stack for each input in the batch
        S = np.empty((unmasked.shape[0],), dtype=object)
        for ix in range(S.shape[0]):
            S[ix] = [str(self.grammar.start_index)]

        # Loop over time axis, sampling values and updating masks
        for t in range(unmasked.shape[1]):
            next_nonterminal = [self.lhs_map[self._pop_or_nothing(a)] for a in S]
            mask = self.grammar.masks[next_nonterminal]
            masked_output = np.exp(unmasked[:, t ,:]) * mask + eps
            sampled_output = np.argmax(np.random.gumbel(size=masked_output.shape) + np.log(masked_output), axis=-1)
            X_hat[np.arange(unmasked.shape[0]), t, sampled_output] = 1.0

            # Identify non-terminals in RHS of selected production, and
            # push them onto the stack in reverse order
            rhs = [filter(lambda a: (type(a) == nltk.grammar.Nonterminal) and (str(a) != 'None'), self.productions[i].rhs()) 
                for i in sampled_output]
            for ix in range(S.shape[0]):
                S[ix].extend(list(map(str, rhs[ix]))[::-1])

        return X_hat

    def _pop_or_nothing(self, S):
        try: 
            return S.pop()
        except: 
            return 'Nothing' 

    def _get_hypers(self, filename):
        hypers = {}

        m = re.search(r'_H(\d+)_', filename)
        hypers['hidden'] = int(m.group(1))
        m = re.search(r'_D(\d+)_', filename)
        hypers['dense'] = int(m.group(1))
        m = re.search(r'_C(\d\d\d)_(\d\d\d)', filename)
        hypers['conv1'] = (int(m.group(1)[0]), int(m.group(2)[0]))
        hypers['conv2'] = (int(m.group(1)[1]), int(m.group(2)[1]))
        hypers['conv3'] = (int(m.group(1)[2]), int(m.group(2)[2]))

        print('model hyper parameters:' + str(hypers))
        return hypers